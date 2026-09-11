package com.trevora.api.shared.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.SupabaseAuthService;
import com.trevora.api.shared.exception.AccountSuspendedException;
import com.trevora.api.shared.exception.ApiErrorResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Resolves the signed-in user once, at the very start of each request, and
 * refuses a suspended account there.
 *
 * <p>The suspension check itself lives in {@link SupabaseAuthService#getCurrentUser}
 * and would happen anyway. The point of doing it here is <em>when</em>: before
 * any service has opened a database transaction. Left to the services, the first
 * lookup of the user usually happened inside one, and the check -- which runs in
 * a transaction of its own -- then needed a second connection while the first
 * was held. Under enough concurrent requests that exhausts the pool. Here it
 * borrows one connection briefly and gives it back, and the result is kept on the
 * request, so nothing later in the request looks the user up again.
 *
 * <p>Runs just after the CORS filter, so a refusal still reaches the page. A token
 * that cannot be verified is not refused here: whatever needs a user refuses it
 * with the message it always has.
 */
@Component
public class AccountStandingFilter extends OncePerRequestFilter implements Ordered {
    private final SupabaseAuthService supabaseAuthService;
    private final ObjectMapper objectMapper;

    public AccountStandingFilter(SupabaseAuthService supabaseAuthService, ObjectMapper objectMapper) {
        this.supabaseAuthService = supabaseAuthService;
        this.objectMapper = objectMapper;
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 10;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            return true;
        }
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        return authorization == null || !authorization.startsWith("Bearer ");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            supabaseAuthService.getCurrentUser(request);
        } catch (AccountSuspendedException suspended) {
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            objectMapper.writeValue(
                    response.getOutputStream(),
                    ApiErrorResponse.of(
                            suspended.getMessage(), HttpStatus.FORBIDDEN.value(), AccountSuspendedException.CODE));
            return;
        } catch (RuntimeException unverified) {
            // Not this filter's call; see the class comment.
        }
        filterChain.doFilter(request, response);
    }
}
