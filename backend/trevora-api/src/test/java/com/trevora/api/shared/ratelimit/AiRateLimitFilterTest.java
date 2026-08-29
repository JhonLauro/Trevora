package com.trevora.api.shared.ratelimit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.SupabaseAuthService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Which requests the limiter charges for. The preflight case is here because
 * it was got wrong once: browsers send an OPTIONS before every one of these
 * calls, so counting them charged each upload twice, and a preflight answered
 * with 429 does not reach the page as a rate limit at all -- it surfaces as a
 * CORS failure with nothing explaining it.
 */
class AiRateLimitFilterTest {

    private final AiRateLimitFilter filter = new AiRateLimitFilter(
            new AiRateLimiter(new AiRateLimitProperties(true, 10, 100, 10_000)),
            mock(SupabaseAuthService.class),
            new ObjectMapper());

    private boolean skipped(String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setServletPath(path);
        return (boolean) ReflectionTestUtils.invokeMethod(filter, "shouldNotFilter", request);
    }

    @Test
    @DisplayName("a CORS preflight is never charged")
    void preflightIsNotCharged() {
        assertTrue(skipped("OPTIONS", "/api/service-drafts/receipt"));
        assertTrue(skipped("OPTIONS", "/api/mechanic-access/sessions/abc/history/search"));
    }

    @Test
    @DisplayName("the calls that spend money are charged")
    void paidEndpointsAreCharged() {
        assertFalse(skipped("POST", "/api/service-drafts/receipt"));
        assertFalse(skipped("POST", "/api/service-drafts/voice"));
        assertFalse(skipped("POST", "/api/service-drafts/voice/transcribe"));
        assertFalse(skipped("POST", "/api/service-drafts/voice/translate"));
        assertFalse(skipped("GET", "/api/mechanic-access/sessions/abc/history/search"));
    }

    @Test
    @DisplayName("endpoints that cost only a database query are not charged")
    void freeEndpointsAreNotCharged() {
        assertTrue(skipped("GET", "/api/vehicles"));
        assertTrue(skipped("GET", "/api/garage"));
        assertTrue(skipped("GET", "/api/auth/me"));
        // Reading shared history is free; only searching it reaches a model.
        assertTrue(skipped("GET", "/api/mechanic-access/sessions/abc/history"));
        assertTrue(skipped("POST", "/api/service-drafts/manual"));
    }
}
