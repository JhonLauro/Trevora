package com.trevora.api.features.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The public keys Supabase signs access tokens with.
 *
 * <p>Projects used to sign with a shared HS256 secret you could paste into an
 * environment variable. New ones sign asymmetrically -- this one uses ECC
 * (P-256) -- and publish the *public* half at
 * {@code /auth/v1/.well-known/jwks.json}. Nothing here is secret: the key
 * verifies a signature, it cannot make one.
 *
 * <p>Fetched once and kept. Two properties of the cache matter more than they
 * look:
 *
 * <ul>
 *   <li><b>A failed refresh never discards a working key.</b> The whole point
 *       of verifying locally is to keep serving while Supabase Auth is unwell,
 *       and throwing away the key the moment that service is unreachable would
 *       hand the outage straight back.</li>
 *   <li><b>An unknown key id forces one refresh.</b> Keys rotate, and a token
 *       signed by a standby key promoted this morning must not be rejected
 *       until a timer happens to expire.</li>
 * </ul>
 */
@Component
public class SupabaseJwkProvider {
    private static final Logger log = LoggerFactory.getLogger(SupabaseJwkProvider.class);

    private static final Duration REFRESH_AFTER = Duration.ofHours(6);
    private static final Duration RETRY_AFTER_FAILURE = Duration.ofMinutes(1);
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(15);

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String jwksUrl;

    private final Map<String, PublicKey> keys = new ConcurrentHashMap<>();
    private volatile long refreshedAt;
    private volatile long lastAttemptAt;

    public SupabaseJwkProvider(ObjectMapper objectMapper, @Value("${supabase.url:}") String supabaseUrl) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
        String base = supabaseUrl == null ? "" : supabaseUrl.trim().replaceAll("/+$", "");
        this.jwksUrl = base.isEmpty() ? "" : base + "/auth/v1/.well-known/jwks.json";
    }

    /**
     * The key with this id, or null when it cannot be produced -- no project
     * URL, an unreachable endpoint, an id nobody publishes, or a key type this
     * does not build. Null means "cannot decide", never "reject".
     */
    public PublicKey keyFor(String rawKeyId) {
        if (jwksUrl.isEmpty() || rawKeyId == null || rawKeyId.isBlank()) {
            return null;
        }

        /* Matched case-insensitively. The dashboard prints key ids in upper
           case and the JWKS endpoint serves them in lower, and a lookup that
           missed on nothing but case would quietly send every request back to
           the Auth service this exists to avoid. */
        String keyId = rawKeyId.toLowerCase(java.util.Locale.ROOT);
        PublicKey known = keys.get(keyId);
        long now = System.currentTimeMillis();
        if (known != null && now - refreshedAt < REFRESH_AFTER.toMillis()) {
            return known;
        }

        // Either nothing cached for this id, or the set is old enough to be
        // worth re-reading. Failures below leave whatever is cached in place.
        if (now - lastAttemptAt > RETRY_AFTER_FAILURE.toMillis() || known == null) {
            refresh(now);
        }

        return keys.get(keyId);
    }

    private synchronized void refresh(long attemptedAt) {
        lastAttemptAt = attemptedAt;
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(jwksUrl))
                    .timeout(REQUEST_TIMEOUT)
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("JWKS fetch returned {}; keeping {} cached key(s)", response.statusCode(), keys.size());
                return;
            }

            JsonNode fetched = objectMapper.readTree(response.body()).path("keys");
            int added = 0;
            for (JsonNode jwk : fetched) {
                String keyId = jwk.path("kid").asText("").toLowerCase(java.util.Locale.ROOT);
                PublicKey key = toPublicKey(jwk);
                if (!keyId.isBlank() && key != null) {
                    keys.put(keyId, key);
                    added++;
                }
            }

            if (added > 0) {
                refreshedAt = System.currentTimeMillis();
                log.info("Loaded {} Supabase signing key(s)", added);
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (Exception unreachable) {
            // Deliberately swallowed: a failed refresh must not invalidate what
            // is already cached, and callers treat null as "ask Supabase".
            log.warn("Could not refresh Supabase signing keys ({}); keeping {} cached key(s)",
                    unreachable.getClass().getSimpleName(), keys.size());
        }
    }

    /** One JWK to a Java key, or null for a key type this does not handle. */
    static PublicKey toPublicKey(JsonNode jwk) {
        try {
            String type = jwk.path("kty").asText("");
            if ("EC".equals(type)) {
                ECPoint point = new ECPoint(
                        unsigned(jwk.path("x").asText("")),
                        unsigned(jwk.path("y").asText("")));
                AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
                parameters.init(new ECGenParameterSpec(curveFor(jwk.path("crv").asText("P-256"))));
                ECParameterSpec spec = parameters.getParameterSpec(ECParameterSpec.class);
                return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point, spec));
            }
            if ("RSA".equals(type)) {
                return KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(
                        unsigned(jwk.path("n").asText("")),
                        unsigned(jwk.path("e").asText(""))));
            }
            return null;
        } catch (Exception unusable) {
            return null;
        }
    }

    private static String curveFor(String crv) {
        return switch (crv) {
            case "P-384" -> "secp384r1";
            case "P-521" -> "secp521r1";
            default -> "secp256r1";
        };
    }

    /* JWK numbers are base64url big-endian and unsigned; the leading 1 keeps
       BigInteger from reading a high bit as a negative number. */
    private static BigInteger unsigned(String base64Url) {
        return new BigInteger(1, Base64.getUrlDecoder().decode(base64Url));
    }
}
