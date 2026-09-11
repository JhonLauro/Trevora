package com.trevora.api.shared.ratelimit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.SupabaseAuthService;
import com.trevora.api.features.mechanicaccess.MechanicAccessSessionRepository;
import com.trevora.api.shared.config.WebConfig;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.filter.CorsFilter;

/**
 * The frontend runs on another origin, so a response without CORS headers is one
 * the page cannot read -- it reports "Could not reach the Trevora API" instead of
 * the reason. The rate limiter answers before any controller, which is exactly
 * where CORS configured as Spring MVC mappings never applied.
 */
class CorsOnRefusalsTest {

    private static final String FRONTEND = "https://trevora-web.onrender.com";
    private static final String PATH = "/api/service-records/00000000-0000-0000-0000-000000000001/ai-explanation";

    private final CorsFilter cors = new CorsFilter(WebConfig.corsConfigurationSource(List.of(FRONTEND)));

    // One explanation a minute, so the second request is refused.
    private final AiRateLimitFilter limiter = new AiRateLimitFilter(
            new AiRateLimiter(new AiRateLimitProperties(true, 10, 100, 10_000)),
            new AiFeatureLimits(10, 100, 350, 5, 40, 1, 200, 10, 100),
            mock(SupabaseAuthService.class),
            mock(MechanicAccessSessionRepository.class),
            new ObjectMapper().findAndRegisterModules(),
            AbuseMonitor.disabled());

    private final HttpServlet endpoint = new HttpServlet() {
        @Override
        protected void service(HttpServletRequest request, HttpServletResponse response) {
            // Stands in for the controller: answers 200 with nothing.
        }
    };

    private MockHttpServletResponse send(String method) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, PATH);
        request.setServletPath(PATH);
        request.addHeader("Origin", FRONTEND);
        if ("OPTIONS".equals(method)) {
            request.addHeader("Access-Control-Request-Method", "GET");
        }
        MockHttpServletResponse response = new MockHttpServletResponse();
        new MockFilterChain(endpoint, cors, limiter).doFilter(request, response);
        return response;
    }

    @Test
    @DisplayName("a refusal written by the rate limiter carries CORS headers, so the page can read why")
    void refusalsCarryCorsHeaders() throws Exception {
        assertEquals(200, send("GET").getStatus());

        MockHttpServletResponse refused = send("GET");

        assertEquals(429, refused.getStatus());
        assertEquals(FRONTEND, refused.getHeader("Access-Control-Allow-Origin"));
    }

    @Test
    @DisplayName("a preflight is answered by the CORS filter and never counted")
    void preflightIsAnsweredAndNotCounted() throws Exception {
        for (int preflight = 0; preflight < 5; preflight++) {
            MockHttpServletResponse response = send("OPTIONS");
            assertEquals(200, response.getStatus());
            assertEquals(FRONTEND, response.getHeader("Access-Control-Allow-Origin"));
        }

        assertEquals(200, send("GET").getStatus(), "five preflights did not use up the one allowed request");
    }
}
