package com.trevora.api.shared.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Production used to accept `http://localhost:*` as an origin, unconditionally.
 *
 * <p>The impact was limited -- the API is bearer-token only with no cookie
 * credentials, so a page on someone's laptop still needed a valid token. But an
 * allowed origin is the browser's permission to read the response, and keeping
 * production's list to the origins production actually has removes a class of
 * future mistake rather than a present exploit.
 *
 * <p>The setting derives itself from whether frontend origins were configured,
 * so nobody has to remember a second variable. These tests pin that derivation,
 * because getting it backwards would either reopen the hole or break every
 * request from the deployed site.
 */
class CorsOriginPolicyTest {

    private List<String> originsFor(String configured, String allowLocalhost) {
        WebConfig config = new WebConfig();
        set(config, "configuredOrigins", configured);
        set(config, "allowLocalhostSetting", allowLocalhost);
        return config.resolveOrigins();
    }

    private void set(WebConfig config, String field, String value) {
        try {
            Field target = WebConfig.class.getDeclaredField(field);
            target.setAccessible(true);
            target.set(config, value);
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Test
    @DisplayName("a laptop with nothing configured still allows localhost")
    void developmentKeepsWorking() {
        assertThat(originsFor("", ""))
                .containsExactly("http://localhost:*", "http://127.0.0.1:*");
    }

    @Test
    @DisplayName("a deployment that names its frontend does not also allow localhost")
    void productionDropsLocalhost() {
        List<String> origins = originsFor("https://trevora-web.onrender.com", "");
        assertThat(origins).containsExactly("https://trevora-web.onrender.com");
        assertThat(origins).noneMatch(origin -> origin.contains("localhost"));
        assertThat(origins).noneMatch(origin -> origin.contains("127.0.0.1"));
    }

    @Test
    @DisplayName("several configured origins are all kept, and trimmed")
    void multipleOriginsSurvive() {
        assertThat(originsFor("https://trevora-web.onrender.com , https://trevora.app", ""))
                .containsExactly("https://trevora-web.onrender.com", "https://trevora.app");
    }

    @Test
    @DisplayName("the derivation can be overridden in both directions")
    void explicitSettingWins() {
        assertThat(originsFor("https://trevora.app", "true"))
                .contains("https://trevora.app", "http://localhost:*");
        // Deliberately odd: no origins and localhost switched off. See below.
        assertThat(originsFor("", "false")).isNotEmpty();
    }

    @Test
    @DisplayName("an impossible configuration falls back rather than returning nothing")
    void neverResolvesToAnEmptyList() {
        /*
         * Spring reads an empty pattern list as "no CORS configured" rather than
         * as a lockdown, which fails in a way that is hard to diagnose. Falling
         * back to localhost keeps a misconfigured server usable on a laptop and
         * logs a warning, instead of silently refusing every browser.
         */
        assertThat(originsFor("", "false"))
                .containsExactly("http://localhost:*", "http://127.0.0.1:*");
    }
}
