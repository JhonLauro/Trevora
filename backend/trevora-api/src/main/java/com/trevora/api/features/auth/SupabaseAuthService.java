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
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class SupabaseAuthService {
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

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(8);

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String supabaseUrl;
    private final String supabaseAnonKey;
    private final Map<String, CachedUser> verifiedTokens = new ConcurrentHashMap<>();

    public SupabaseAuthService(
            ObjectMapper objectMapper,
            @Value("${supabase.url:}") String supabaseUrl,
            @Value("${supabase.anon-key:}") String supabaseAnonKey
    ) {
        this.objectMapper = objectMapper;
        /* Without a connect timeout a slow Supabase holds a request thread for
           as long as the OS default allows, which on a small instance is how a
           slow dependency becomes an unavailable API. */
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(CONNECT_TIMEOUT)
                .build();
        this.supabaseUrl = trimTrailingSlash(supabaseUrl);
        this.supabaseAnonKey = supabaseAnonKey == null ? "" : supabaseAnonKey.trim();
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

        SupabaseAuthenticatedUser user = fetchUser(token);
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

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new AuthException("Supabase session is invalid or expired.");
            }
            return parseUser(response.body());
        } catch (IOException exception) {
            throw new AuthException("Unable to contact Supabase Auth.");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AuthException("Supabase Auth verification was interrupted.");
        }
    }

    private SupabaseAuthenticatedUser parseUser(String body) throws IOException {
        JsonNode root = objectMapper.readTree(body);
        UUID userId = UUID.fromString(requiredText(root, "id"));
        String email = requiredText(root, "email");
        JsonNode metadata = root.path("user_metadata");

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
