package com.trevora.api.features.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Verifying the tokens this project actually issues.
 *
 * <p>Its current signing key is ECC P-256 -- ES256 -- with the old HS256 shared
 * secret kept only for tokens minted before the rotation. An HS256-only
 * verifier therefore deferred on every live token and sent every request to
 * Supabase Auth, which is the failure this exists to prevent.
 */
class AsymmetricTokenVerificationTest {
    private static final String KEY_ID = "294290DE-E71F-498D-AD41-C19B68A5D699";

    /** A provider that publishes one key, standing in for the JWKS endpoint. */
    private static SupabaseJwkProvider providerFor(PublicKey key) {
        return new SupabaseJwkProvider(new ObjectMapper(), "") {
            @Override
            public PublicKey keyFor(String keyId) {
                return KEY_ID.equals(keyId) ? key : null;
            }
        };
    }

    private static String base64(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static String base64(String value) {
        return base64(value.getBytes(StandardCharsets.UTF_8));
    }

    /** Signs the way a JWS does: r and s concatenated, not DER. */
    private static String es256Token(KeyPair keyPair, String keyId, String claims) throws Exception {
        String body = base64("{\"alg\":\"ES256\",\"typ\":\"JWT\",\"kid\":\"" + keyId + "\"}")
                + "." + base64(claims);

        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(keyPair.getPrivate());
        signer.update(body.getBytes(StandardCharsets.US_ASCII));
        byte[] der = signer.sign();

        int fieldSize = (((ECPublicKey) keyPair.getPublic()).getParams().getCurve()
                .getField().getFieldSize() + 7) / 8;
        return body + "." + base64(joseFromDer(der, fieldSize));
    }

    /** The inverse of the conversion under test, so the test does not simply
        agree with the implementation's own mistakes. */
    private static byte[] joseFromDer(byte[] der, int fieldSize) {
        int index = 3;
        int rLength = der[index++];
        BigInteger r = new BigInteger(java.util.Arrays.copyOfRange(der, index, index + rLength));
        index += rLength + 1;
        int sLength = der[index++];
        BigInteger s = new BigInteger(java.util.Arrays.copyOfRange(der, index, index + sLength));

        byte[] jose = new byte[fieldSize * 2];
        copyRightAligned(r, jose, 0, fieldSize);
        copyRightAligned(s, jose, fieldSize, fieldSize);
        return jose;
    }

    private static void copyRightAligned(BigInteger value, byte[] target, int offset, int width) {
        byte[] bytes = value.toByteArray();
        int from = Math.max(0, bytes.length - width);
        int length = bytes.length - from;
        System.arraycopy(bytes, from, target, offset + width - length, length);
    }

    private static String claims(Instant expiry) {
        return "{\"sub\":\"3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071\",\"email\":\"owner@example.com\","
                + "\"exp\":" + expiry.getEpochSecond() + ","
                + "\"user_metadata\":{\"first_name\":\"Brent\",\"last_name\":\"Unabia\"}}";
    }

    private static KeyPair p256() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        return generator.generateKeyPair();
    }

    private SupabaseAuthService serviceWith(PublicKey key) {
        return new SupabaseAuthService(
                new ObjectMapper(), providerFor(key), "https://example.supabase.co", "anon-key", "");
    }

    @Test
    @DisplayName("an ES256 token is verified against the published key")
    void acceptsEs256() throws Exception {
        KeyPair keyPair = p256();
        String token = es256Token(keyPair, KEY_ID, claims(Instant.now().plus(Duration.ofHours(1))));

        SupabaseAuthenticatedUser user = serviceWith(keyPair.getPublic()).verifyLocally(token);

        assertThat(user).isNotNull();
        assertThat(user.email()).isEqualTo("owner@example.com");
        assertThat(user.firstName()).isEqualTo("Brent");
    }

    @Test
    @DisplayName("a token signed by a different key is not accepted")
    void refusesForeignKey() throws Exception {
        String token = es256Token(p256(), KEY_ID, claims(Instant.now().plus(Duration.ofHours(1))));

        // Verified against somebody else's public key.
        assertThat(serviceWith(p256().getPublic()).verifyLocally(token)).isNull();
    }

    @Test
    @DisplayName("an expired ES256 token is not accepted")
    void refusesExpired() throws Exception {
        KeyPair keyPair = p256();
        String token = es256Token(keyPair, KEY_ID, claims(Instant.now().minus(Duration.ofMinutes(1))));

        assertThat(serviceWith(keyPair.getPublic()).verifyLocally(token)).isNull();
    }

    @Test
    @DisplayName("an unknown key id defers rather than rejecting")
    void defersOnUnknownKeyId() throws Exception {
        KeyPair keyPair = p256();
        String token = es256Token(keyPair, "some-other-key", claims(Instant.now().plus(Duration.ofHours(1))));

        assertThat(serviceWith(keyPair.getPublic()).verifyLocally(token)).isNull();
    }

    @Test
    @DisplayName("the DER conversion round-trips a real signature")
    void derConversionMatches() throws Exception {
        KeyPair keyPair = p256();
        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(keyPair.getPrivate());
        signer.update("payload".getBytes(StandardCharsets.US_ASCII));
        byte[] der = signer.sign();

        byte[] jose = joseFromDer(der, 32);
        byte[] rebuilt = SupabaseAuthService.derFromJose(jose);

        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(keyPair.getPublic());
        verifier.update("payload".getBytes(StandardCharsets.US_ASCII));
        assertThat(verifier.verify(rebuilt)).isTrue();
    }
}
