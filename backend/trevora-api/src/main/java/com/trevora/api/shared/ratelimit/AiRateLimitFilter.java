package com.trevora.api.shared.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.SupabaseAuthService;
import com.trevora.api.shared.exception.ApiErrorResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Rate limits the endpoints that call a paid third-party API on our key.
 *
 * <p>Only these endpoints are limited. Reading a vehicle costs a database
 * query; extracting a receipt costs one Google Vision call per page plus an
 * OpenAI completion, and mechanic search costs a call to the most expensive
 * model we use. Those are the ones worth spending a bucket on.
 */
@Component
public class AiRateLimitFilter extends OncePerRequestFilter {
    private static final String MECHANIC_SEARCH_PATTERN = "/api/mechanic-access/sessions/*/history/search";
    private static final List<String> OWNER_AI_PATTERNS = List.of(
            "/api/service-drafts/receipt",
            "/api/service-drafts/voice",
            "/api/service-drafts/voice/transcribe",
            "/api/service-drafts/voice/translate"
    );

    private final AntPathMatcher pathMatcher = new AntPathMatcher();
    private final AiRateLimiter rateLimiter;
    private final SupabaseAuthService supabaseAuthService;
    private final ObjectMapper objectMapper;

    public AiRateLimitFilter(
            AiRateLimiter rateLimiter,
            SupabaseAuthService supabaseAuthService,
            ObjectMapper objectMapper
    ) {
        this.rateLimiter = rateLimiter;
        this.supabaseAuthService = supabaseAuthService;
        this.objectMapper = objectMapper;
    }

    /*
     * Path match only. Deriving the key resolves the caller's token, and doing
     * that here would verify it twice on every guarded request.
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        /*
         * A browser sends a preflight before every one of these calls, so
         * counting them charged each upload twice -- and a preflight answered
         * with 429 is not reported as a rate limit at all, it surfaces as a
         * CORS failure with no explanation. A preflight costs us nothing
         * upstream; it never reaches OpenAI.
         */
        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            return true;
        }
        String path = requestPath(request);
        if (path == null) {
            return true;
        }
        if (pathMatcher.match(MECHANIC_SEARCH_PATTERN, path)) {
            return false;
        }
        return OWNER_AI_PATTERNS.stream().noneMatch(pattern -> pathMatcher.match(pattern, path));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String key = rateLimitKey(request);
        if (key == null) {
            filterChain.doFilter(request, response);
            return;
        }

        AiRateLimiter.Decision decision = rateLimiter.tryConsume(key);
        if (decision.allowed()) {
            filterChain.doFilter(request, response);
            return;
        }

        writeTooManyRequests(response, decision.retryAfterSeconds());
    }

    /**
     * The bucket a request counts against, or null when the endpoint is not one
     * that spends money.
     *
     * <p>Mechanic search is keyed by session because it has no signed-in user
     * at all -- the session id in the path is the entire credential. Everything
     * else is keyed by the owner making the call.
     */
    private String rateLimitKey(HttpServletRequest request) {
        String path = requestPath(request);
        if (path == null) {
            return null;
        }

        if (pathMatcher.match(MECHANIC_SEARCH_PATTERN, path)) {
            String sessionId = pathMatcher.extractUriTemplateVariables(
                    "/api/mechanic-access/sessions/{sessionId}/history/search", path).get("sessionId");
            return sessionId == null ? null : "session:" + sessionId;
        }

        for (String pattern : OWNER_AI_PATTERNS) {
            if (pathMatcher.match(pattern, path)) {
                return "owner:" + callerIdentity(request);
            }
        }
        return null;
    }

    private String requestPath(HttpServletRequest request) {
        String path = request.getServletPath();
        if (path == null || path.isBlank()) {
            path = request.getRequestURI();
        }
        return path == null || path.isBlank() ? null : path;
    }

    /*
     * Resolving the user here means the token is verified twice on these
     * routes, once by the filter and once by the service. With the JWT secret
     * configured that is an in-process signature check, which is nothing beside
     * the multi-second OpenAI call it is guarding.
     *
     * When the token cannot be resolved to a user we still want a stable key,
     * because a request that is about to be rejected can still be looped. The
     * token's hash is that key -- the raw token is a credential and never
     * belongs in a map key or a log line. With no token at all we fall back to
     * the peer address.
     */
    private String callerIdentity(HttpServletRequest request) {
        try {
            var user = supabaseAuthService.getCurrentUser(request);
            if (user.isPresent()) {
                return "user:" + user.get().userId();
            }
        } catch (RuntimeException exception) {
            // An unresolvable token is not a reason to skip limiting.
        }

        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && !header.isBlank()) {
            return "token:" + sha256(header);
        }
        return "ip:" + String.valueOf(request.getRemoteAddr());
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required to key rate limits.", exception);
        }
    }

    private void writeTooManyRequests(HttpServletResponse response, long retryAfterSeconds) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds));
        objectMapper.writeValue(
                response.getOutputStream(),
                ApiErrorResponse.of(
                        "Too many requests. Wait " + retryAfterSeconds + " seconds and try again.",
                        HttpStatus.TOO_MANY_REQUESTS.value()
                )
        );
    }
}
