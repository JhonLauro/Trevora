package com.trevora.api.features.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.shared.exception.AuthException;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.math.BigInteger;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.time.Duration;
import java.util.Arrays;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class SupabaseAuthService {
    private static final Logger log = LoggerFactory.getLogger(SupabaseAuthService.class);
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String REQUEST_ATTRIBUTE = SupabaseAuthService.class.getName() + ".user";

    /* Verifying a token costs an HTTP round trip to Supabase, and the API runs
       in a different region from the project -- roughly 100ms per call, paid by
       every authenticated request before it does any work of its own. A garage
       load makes several requests, so that is half a second of nothing.

       The result is therefore held briefly. The window is short on purpose: a
       token that has been revoked or signed out keeps working until it lapses,
       so the trade is a few seconds of staleness against a round trip on every
       request. It is never held past the token's own expiry. */
    private static final Duration CACHE_TTL = Duration.ofSeconds(60);

    /* A bound, so a burst of distinct tokens cannot grow this without limit.
       Well above any realistic number of concurrent sessions. */
    private static final int CACHE_MAX_ENTRIES = 2_000;

    /* Sized for the worst case this actually runs in, not for a healthy one.
       The API sits in one region and the Supabase project in another, on an
       instance that sleeps and wakes with a cold JVM and throttled CPU: a warm
       round trip measured about five seconds, so the eight-second ceiling these
       replaced was turning a slow first call into a failed sign-in. They exist
       to stop a hung dependency pinning a request thread forever -- that is the
       only job, and twenty seconds does it. */
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(20);

    /* One retry, because the failure this guards against is specifically the
       first call after a wake-up. The second attempt runs against a warmed
       connection pool and TLS session and usually costs a fraction of the
       first. */
    private static final int ATTEMPTS = 2;
    private static final Duration RETRY_PAUSE = Duration.ofMillis(300);

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String supabaseUrl;
    private final String supabaseAnonKey;
    private final String jwtSecret;
    private final Map<String, CachedUser> verifiedTokens = new ConcurrentHashMap<>();

    /* Tokens are checked against this before anything is sent anywhere. See
       verifyLocally. */
    private static final String HS256 = "HS256";
    private static final long CLOCK_SKEW_MS = 30_000L;

    private final SupabaseJwkProvider jwkProvider;

    public SupabaseAuthService(
            ObjectMapper objectMapper,
            SupabaseJwkProvider jwkProvider,
            @Value("${supabase.url:}") String supabaseUrl,
            @Value("${supabase.anon-key:}") String supabaseAnonKey,
            @Value("${supabase.jwt-secret:}") String jwtSecret
    ) {
        this.jwkProvider = jwkProvider;
        this.objectMapper = objectMapper;
        /* Without a connect timeout a slow Supabase holds a request thread for
           as long as the OS default allows, which on a small instance is how a
           slow dependency becomes an unavailable API. */
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(CONNECT_TIMEOUT)
                .build();
        this.supabaseUrl = trimTrailingSlash(supabaseUrl);
        this.supabaseAnonKey = supabaseAnonKey == null ? "" : supabaseAnonKey.trim();
        this.jwtSecret = jwtSecret == null ? "" : jwtSecret.trim();

        /* Said once, at startup, because the difference is invisible from
           outside and decides whether this API can serve a request while
           Supabase Auth is unwell. No secret is logged -- only whether one
           arrived. */
        log.info("Supabase token verification: asymmetric keys are read from the project's JWKS "
                + "endpoint automatically{}. Supabase Auth is contacted only for tokens this cannot "
                + "settle locally.",
                this.jwtSecret.isEmpty() ? "; no legacy HS256 secret configured" : ", plus the legacy HS256 secret");
    }

    public Optional<SupabaseAuthenticatedUser> getCurrentUser(HttpServletRequest request) {
        String token = bearerToken(request);
        if (token == null) {
            return Optional.empty();
        }

        Object cachedUser = request.getAttribute(REQUEST_ATTRIBUTE);
        if (cachedUser instanceof SupabaseAuthenticatedUser user) {
            return Optional.of(user);
        }

        SupabaseAuthenticatedUser user = verify(token);
        request.setAttribute(REQUEST_ATTRIBUTE, user);
        return Optional.of(user);
    }

    /**
     * The verified user behind this token, from the short-lived cache when it
     * is there and from Supabase when it is not.
     */
    private SupabaseAuthenticatedUser verify(String token) {
        String key = cacheKey(token);
        long now = System.currentTimeMillis();

        CachedUser cached = verifiedTokens.get(key);
        if (cached != null && cached.expiresAt() > now) {
            return cached.user();
        }
        if (cached != null) {
            verifiedTokens.remove(key, cached);
        }

        SupabaseAuthenticatedUser local = verifyLocally(token);
        SupabaseAuthenticatedUser user = local != null ? local : fetchUser(token);
        verifiedTokens.put(key, new CachedUser(user, cacheUntil(token, now)));
        pruneIfCrowded(now);
        return user;
    }

    /**
     * When the cached answer stops being usable: the shorter of the cache
     * window and the token's own expiry.
     *
     * <p>The {@code exp} claim is read without verifying the signature, which
     * is safe for this and only this: the token has already been verified by
     * Supabase on the line above, and the claim is used solely to cache for
     * less time, never for more. A malformed or missing claim falls back to the
     * plain window.
     */
    private long cacheUntil(String token, long now) {
        long window = now + CACHE_TTL.toMillis();
        try {
            String[] parts = token.split("\\.");
            if (parts.length < 2) {
                return window;
            }
            byte[] payload = Base64.getUrlDecoder().decode(parts[1]);
            JsonNode claims = objectMapper.readTree(new String(payload, StandardCharsets.UTF_8));
            JsonNode exp = claims.path("exp");
            if (!exp.isNumber()) {
                return window;
            }
            return Math.min(window, exp.asLong() * 1000L);
        } catch (RuntimeException | IOException exception) {
            return window;
        }
    }

    /** Drops what has lapsed, and failing that everything, rather than growing
        without bound. Cheap, and only ever runs at the ceiling. */
    private void pruneIfCrowded(long now) {
        if (verifiedTokens.size() < CACHE_MAX_ENTRIES) {
            return;
        }
        verifiedTokens.values().removeIf(entry -> entry.expiresAt() <= now);
        if (verifiedTokens.size() >= CACHE_MAX_ENTRIES) {
            verifiedTokens.clear();
        }
    }

    /* The map is keyed by a digest rather than the token, so a heap dump or a
       stray log of the key set does not hand out live credentials. */
    private String cacheKey(String token) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            return Base64.getEncoder().encodeToString(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            // SHA-256 is required of every JVM; this cannot happen.
            throw new IllegalStateException(exception);
        }
    }

    private record CachedUser(SupabaseAuthenticatedUser user, long expiresAt) {
    }

    public SupabaseAuthenticatedUser requireCurrentUser(HttpServletRequest request) {
        return getCurrentUser(request)
                .orElseThrow(() -> new AuthException("A valid Supabase session is required."));
    }

    /**
     * The user behind this token, worked out from the token itself.
     *
     * <p>A Supabase access token is a signed JWT: everything needed to trust it
     * -- the signature, the expiry, the user id, the metadata -- is inside it.
     * Asking Supabase to read it back was a network call per request to learn
     * something already in hand, and it made every endpoint in this API depend
     * on the Auth service being up and quick. When Auth went unhealthy, sign-in
     * failed with a twenty-second timeout even though the token in the request
     * was perfectly valid.
     *
     * <p><b>This method can only ever accept, never reject.</b> Anything it
     * cannot settle -- no secret configured, a signing algorithm it does not
     * implement, a bad signature, an expired or malformed token -- returns null
     * and leaves the decision to {@link #fetchUser}, which asks Supabase and is
     * authoritative. That invariant is what makes a wrong or missing
     * {@code SUPABASE_JWT_SECRET} a performance problem rather than an outage,
     * and it is why a forged token cannot get through here: the worst it earns
     * is the round trip it would have made anyway.
     *
     * @return the verified user, or null when this cannot be decided locally
     */
    SupabaseAuthenticatedUser verifyLocally(String token) {
        /* No early exit on a missing HS256 secret. This project signs with an
           asymmetric key, where there is nothing to configure and the public
           half comes from the JWKS endpoint; each algorithm states its own
           requirement in signatureIsValid instead. Leaving that check here is
           what made every live token fall through to Supabase. */
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                return null;
            }

            JsonNode header = objectMapper.readTree(decode(parts[0]));
            String signingInput = parts[0] + "." + parts[1];
            byte[] signature = Base64.getUrlDecoder().decode(parts[2]);

            if (!signatureIsValid(text(header, "alg"), text(header, "kid"), signingInput, signature)) {
                return null;
            }

            JsonNode claims = objectMapper.readTree(decode(parts[1]));
            JsonNode expiry = claims.path("exp");
            if (!expiry.isNumber()
                    || expiry.asLong() * 1000L <= System.currentTimeMillis() - CLOCK_SKEW_MS) {
                return null;
            }

            String subject = text(claims, "sub");
            String email = text(claims, "email");
            if (subject.isBlank() || email.isBlank()) {
                return null;
            }

            return userFrom(UUID.fromString(subject), email, claims.path("user_metadata"));
        } catch (RuntimeException | IOException unusable) {
            // Malformed in some way this does not model. Let Supabase decide.
            return null;
        }
    }

    /**
     * Whether this signature belongs to this token.
     *
     * <p>Two families, because the project has one of each: the legacy shared
     * secret (HS256), and the asymmetric key it signs with now (ES256 on
     * P-256, or RS256). Anything else -- an algorithm not listed, a key id
     * nobody publishes, "none" -- is false, which sends the caller to the HTTP
     * path rather than admitting the token.
     */
    private boolean signatureIsValid(String algorithm, String keyId, String signingInput, byte[] signature)
            throws IOException {
        if (HS256.equalsIgnoreCase(algorithm)) {
            return !jwtSecret.isEmpty()
                    && MessageDigest.isEqual(hmacSha256(signingInput), signature);
        }

        String javaAlgorithm = switch (algorithm == null ? "" : algorithm.toUpperCase(Locale.ROOT)) {
            case "ES256" -> "SHA256withECDSA";
            case "ES384" -> "SHA384withECDSA";
            case "RS256" -> "SHA256withRSA";
            case "RS512" -> "SHA512withRSA";
            default -> null;
        };
        if (javaAlgorithm == null) {
            return false;
        }

        PublicKey key = jwkProvider.keyFor(keyId);
        if (key == null) {
            return false;
        }

        try {
            Signature verifier = Signature.getInstance(javaAlgorithm);
            verifier.initVerify(key);
            verifier.update(signingInput.getBytes(StandardCharsets.US_ASCII));
            byte[] encoded = javaAlgorithm.endsWith("ECDSA") ? derFromJose(signature) : signature;
            return verifier.verify(encoded);
        } catch (java.security.GeneralSecurityException | IllegalArgumentException unusable) {
            return false;
        }
    }

    /**
     * A JWS ECDSA signature is r and s concatenated, fixed width. Java expects
     * them DER-encoded, so they are re-wrapped here. For P-256 the result is
     * always under 128 bytes, which is why the length byte needs no long form.
     */
    static byte[] derFromJose(byte[] jose) {
        int half = jose.length / 2;
        byte[] r = new BigInteger(1, Arrays.copyOfRange(jose, 0, half)).toByteArray();
        byte[] s = new BigInteger(1, Arrays.copyOfRange(jose, half, jose.length)).toByteArray();

        byte[] der = new byte[6 + r.length + s.length];
        der[0] = 0x30;
        der[1] = (byte) (4 + r.length + s.length);
        der[2] = 0x02;
        der[3] = (byte) r.length;
        System.arraycopy(r, 0, der, 4, r.length);
        der[4 + r.length] = 0x02;
        der[5 + r.length] = (byte) s.length;
        System.arraycopy(s, 0, der, 6 + r.length, s.length);
        return der;
    }

    private byte[] hmacSha256(String signingInput) throws IOException {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(signingInput.getBytes(StandardCharsets.US_ASCII));
        } catch (java.security.NoSuchAlgorithmException | java.security.InvalidKeyException exception) {
            throw new IOException(exception);
        }
    }

    private static String decode(String segment) {
        return new String(Base64.getUrlDecoder().decode(segment), StandardCharsets.UTF_8);
    }

    private SupabaseAuthenticatedUser fetchUser(String token) {
        if (supabaseUrl.isBlank() || supabaseAnonKey.isBlank()) {
            throw new AuthException("Supabase Auth is not configured on the backend.");
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/auth/v1/user"))
                .header("Authorization", BEARER_PREFIX + token)
                .header("apikey", supabaseAnonKey)
                .timeout(REQUEST_TIMEOUT)
                .GET()
                .build();

        IOException lastFailure = null;

        for (int attempt = 1; attempt <= ATTEMPTS; attempt++) {
            try {
                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    // Supabase answered and said no. Retrying cannot change that.
                    throw new AuthException("Supabase session is invalid or expired.");
                }
                return parseUser(response.body());
            } catch (IOException exception) {
                // Timed out, or never connected. Worth one more try; see ATTEMPTS.
                lastFailure = exception;
                if (attempt < ATTEMPTS) {
                    pauseBeforeRetry();
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AuthException("Supabase Auth verification was interrupted.");
            }
        }

        throw new AuthException("Unable to contact Supabase Auth: " + describe(lastFailure));
    }

    private void pauseBeforeRetry() {
        try {
            Thread.sleep(RETRY_PAUSE.toMillis());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    /** Enough of the cause to tell a timeout from a DNS failure in a log,
        without putting a stack trace in front of somebody signing in. */
    private static String describe(IOException failure) {
        if (failure == null) {
            return "no response";
        }
        String message = failure.getMessage();
        String type = failure.getClass().getSimpleName();
        return message == null || message.isBlank() ? type : type + " (" + message + ")";
    }

    private SupabaseAuthenticatedUser parseUser(String body) throws IOException {
        JsonNode root = objectMapper.readTree(body);
        return userFrom(
                UUID.fromString(requiredText(root, "id")),
                requiredText(root, "email"),
                root.path("user_metadata")
        );
    }

    /* Shared by both paths on purpose: the token's `user_metadata` claim and
       the Auth API's `user_metadata` field are the same object, so a name read
       one way must come out the same read the other. */
    private SupabaseAuthenticatedUser userFrom(UUID userId, String email, JsonNode metadata) {
        String firstName = text(metadata, "first_name");
        String lastName = text(metadata, "last_name");
        String fullName = text(metadata, "full_name");
        if (firstName.isBlank() && !fullName.isBlank()) {
            String[] parts = fullName.trim().split("\\s+", 2);
            firstName = parts[0];
            lastName = parts.length > 1 ? parts[1] : "";
        }

        return new SupabaseAuthenticatedUser(
                userId,
                email,
                firstName.isBlank() ? "User" : firstName,
                lastName,
                parseRole(text(metadata, "role"))
        );
    }

    private UserRole parseRole(String role) {
        if (role == null || role.isBlank()) {
            return UserRole.VEHICLE_OWNER;
        }
        try {
            return UserRole.valueOf(role.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            return UserRole.VEHICLE_OWNER;
        }
    }

    private String bearerToken(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        if (authorization == null || !authorization.startsWith(BEARER_PREFIX)) {
            return null;
        }
        String token = authorization.substring(BEARER_PREFIX.length()).trim();
        return token.isBlank() ? null : token;
    }

    private String requiredText(JsonNode node, String fieldName) {
        String value = text(node, fieldName);
        if (value.isBlank()) {
            throw new AuthException("Supabase user response is missing " + fieldName + ".");
        }
        return value;
    }

    private String text(JsonNode node, String fieldName) {
        JsonNode value = node.path(fieldName);
        return value.isTextual() ? value.asText().trim() : "";
    }

    private String trimTrailingSlash(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().replaceAll("/+$", "");
    }
}
