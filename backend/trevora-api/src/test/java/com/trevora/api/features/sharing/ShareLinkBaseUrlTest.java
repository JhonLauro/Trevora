package com.trevora.api.features.sharing;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The address a share QR code points at.
 *
 * <p>This is worth a test because getting it wrong is invisible in
 * development and total in production: the deployed API defaulted to
 * {@code http://localhost:5173} and was configured nowhere, so every code it
 * generated opened nothing on the phone that scanned it, while the same code
 * worked perfectly on the developer's machine.
 */
class ShareLinkBaseUrlTest {

    private String resolve(String configured, String corsOrigins) throws Exception {
        Method method = QRAccessService.class
                .getDeclaredMethod("resolveFrontendBaseUrl", String.class, String.class);
        method.setAccessible(true);
        return (String) method.invoke(null, configured, corsOrigins);
    }

    @Test
    @DisplayName("an explicit setting wins over everything")
    void explicitSettingWins() throws Exception {
        assertThat(resolve("https://trevora.app", "https://trevora-web.onrender.com"))
                .isEqualTo("https://trevora.app");
        assertThat(resolve("  https://trevora.app  ", ""))
                .isEqualTo("https://trevora.app");
    }

    @Test
    @DisplayName("otherwise the first real CORS origin, which is the browser app")
    void fallsBackToCorsOrigin() throws Exception {
        assertThat(resolve("", "https://trevora-web.onrender.com"))
                .isEqualTo("https://trevora-web.onrender.com");
        assertThat(resolve(null, "https://trevora-web.onrender.com,https://trevora.app"))
                .isEqualTo("https://trevora-web.onrender.com");
    }

    @Test
    @DisplayName("development entries are skipped -- a phone cannot open either")
    void skipsLocalhostAndWildcards() throws Exception {
        assertThat(resolve("", "http://localhost:5173,https://trevora-web.onrender.com"))
                .isEqualTo("https://trevora-web.onrender.com");
        assertThat(resolve("", "https://*.onrender.com,https://trevora.app"))
                .isEqualTo("https://trevora.app");
        assertThat(resolve("", "http://127.0.0.1:5173,https://trevora.app"))
                .isEqualTo("https://trevora.app");
    }

    @Test
    @DisplayName("with nothing configured at all, the development default")
    void developmentDefault() throws Exception {
        assertThat(resolve("", "")).isEqualTo("http://localhost:5173");
        assertThat(resolve(null, null)).isEqualTo("http://localhost:5173");
        assertThat(resolve("", "http://localhost:5173")).isEqualTo("http://localhost:5173");
    }
}
