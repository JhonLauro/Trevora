package com.trevora.api.features.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Verifying an access token without asking Supabase to do it.
 *
 * <p>The invariant under test is the one that makes this safe to ship: local
 * verification may <b>accept</b> a token, and may never <b>reject</b> one. Every
 * case it cannot settle returns null, which sends the request down the HTTP
 * path where Supabase decides. A wrong secret therefore costs a round trip, not
 * an outage, and a forged token gets no further than it would have anyway.
 */
class LocalTokenVerificationTest {
    private static final String SECRET = "a-test-jwt-secret-long-enough-to-be-realistic";

    private static final SupabaseJwkProvider NO_ASYMMETRIC_KEYS =
            new SupabaseJwkProvider(new ObjectMapper(), "");

    private final SupabaseAuthService service = new SupabaseAuthService(
            new ObjectMapper(), NO_ASYMMETRIC_KEYS, "https://example.supabase.co", "anon-key", SECRET);

    private static String base64(String value) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String token(String header, String claims, String signingSecret) throws Exception {
        String body = base64(header) + "." + base64(claims);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(signingSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signature = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal(body.getBytes(StandardCharsets.US_ASCII)));
        return body + "." + signature;
    }

    private static String claims(String userId, String email, Instant expiry, String metadata) {
        return "{\"sub\":\"" + userId + "\",\"email\":\"" + email + "\",\"exp\":"
                + expiry.getEpochSecond() + ",\"user_metadata\":" + metadata + "}";
    }

    @Test
    @DisplayName("a valid token is read without any network call")
    void acceptsValidToken() throws Exception {
        String jwt = token(
                "{\"alg\":\"HS256\",\"typ\":\"JWT\"}",
                claims("3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071", "owner@example.com",
                        Instant.now().plus(Duration.ofHours(1)),
                        "{\"first_name\":\"Brent\",\"last_name\":\"Unabia\",\"role\":\"VEHICLE_OWNER\"}"),
                SECRET);

        SupabaseAuthenticatedUser user = service.verifyLocally(jwt);

        assertThat(user).isNotNull();
        assertThat(user.email()).isEqualTo("owner@example.com");
        assertThat(user.firstName()).isEqualTo("Brent");
        assertThat(user.lastName()).isEqualTo("Unabia");
        assertThat(user.role()).isEqualTo(UserRole.VEHICLE_OWNER);
    }

    @Test
    @DisplayName("a name is derived from full_name when the split fields are absent")
    void derivesNameFromFullName() throws Exception {
        String jwt = token(
                "{\"alg\":\"HS256\"}",
                claims("3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071", "owner@example.com",
                        Instant.now().plus(Duration.ofHours(1)),
                        "{\"full_name\":\"Maria Dela Cruz\"}"),
                SECRET);

        SupabaseAuthenticatedUser user = service.verifyLocally(jwt);

        assertThat(user).isNotNull();
        assertThat(user.firstName()).isEqualTo("Maria");
        assertThat(user.lastName()).isEqualTo("Dela Cruz");
    }

    @Test
    @DisplayName("a token signed with another secret is not accepted")
    void refusesForeignSignature() throws Exception {
        String jwt = token(
                "{\"alg\":\"HS256\"}",
                claims("3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071", "attacker@example.com",
                        Instant.now().plus(Duration.ofHours(1)), "{}"),
                "not-the-projects-secret");

        assertThat(service.verifyLocally(jwt)).isNull();
    }

    @Test
    @DisplayName("an expired token is not accepted")
    void refusesExpiredToken() throws Exception {
        String jwt = token(
                "{\"alg\":\"HS256\"}",
                claims("3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071", "owner@example.com",
                        Instant.now().minus(Duration.ofMinutes(5)), "{}"),
                SECRET);

        assertThat(service.verifyLocally(jwt)).isNull();
    }

    @Test
    @DisplayName("an asymmetric token with no published key is left to Supabase")
    void defersWhenNoKeyIsPublished() throws Exception {
        String jwt = token(
                "{\"alg\":\"ES256\"}",
                claims("3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071", "owner@example.com",
                        Instant.now().plus(Duration.ofHours(1)), "{}"),
                SECRET);

        assertThat(service.verifyLocally(jwt)).isNull();
    }

    @Test
    @DisplayName("nonsense is left to Supabase rather than guessed at")
    void defersOnMalformedTokens() {
        assertThat(service.verifyLocally("not-a-jwt")).isNull();
        assertThat(service.verifyLocally("only.two")).isNull();
        assertThat(service.verifyLocally("a.b.c")).isNull();
        assertThat(service.verifyLocally("")).isNull();
    }

    @Test
    @DisplayName("with no secret configured, nothing is decided locally")
    void defersWhenUnconfigured() throws Exception {
        SupabaseAuthService unconfigured = new SupabaseAuthService(
                new ObjectMapper(), NO_ASYMMETRIC_KEYS, "https://example.supabase.co", "anon-key", "");
        String jwt = token(
                "{\"alg\":\"HS256\"}",
                claims("3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071", "owner@example.com",
                        Instant.now().plus(Duration.ofHours(1)), "{}"),
                SECRET);

        assertThat(unconfigured.verifyLocally(jwt)).isNull();
    }
}
