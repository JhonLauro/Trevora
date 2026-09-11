package com.trevora.api.shared.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.SupabaseAuthService;
import com.trevora.api.features.auth.SupabaseAuthenticatedUser;
import com.trevora.api.features.auth.UserRole;
import com.trevora.api.shared.exception.AccountSuspendedException;
import com.trevora.api.shared.exception.AuthException;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * A suspended account is stopped at the start of the request, before anything
 * opens a transaction; everyone else passes straight through.
 */
class AccountStandingFilterTest {

    private final SupabaseAuthService auth = mock(SupabaseAuthService.class);
    private final AccountStandingFilter filter =
            new AccountStandingFilter(auth, new ObjectMapper().findAndRegisterModules());

    private MockHttpServletRequest request(String method, String authorization) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, "/api/vehicles");
        if (authorization != null) {
            request.addHeader("Authorization", authorization);
        }
        return request;
    }

    @Test
    @DisplayName("a suspended account is refused with 403 and the reason, and goes no further")
    void suspendedAccountIsRefused() throws Exception {
        when(auth.getCurrentUser(any())).thenThrow(
                new AccountSuspendedException("Your Trevora account has been suspended."));
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request("GET", "Bearer token"), response, chain);

        assertEquals(403, response.getStatus());
        assertTrue(response.getContentAsString().contains("\"code\":\"ACCOUNT_SUSPENDED\""));
        assertTrue(response.getContentAsString().contains("suspended"));
        assertNull(chain.getRequest(), "nothing after the filter runs");
    }

    @Test
    @DisplayName("an account in good standing passes straight through")
    void goodStandingPassesThrough() throws Exception {
        when(auth.getCurrentUser(any())).thenReturn(Optional.of(
                new SupabaseAuthenticatedUser(UUID.randomUUID(), "owner@example.com", "Owner", "", UserRole.VEHICLE_OWNER)));
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request("GET", "Bearer token"), new MockHttpServletResponse(), chain);

        assertNotNull(chain.getRequest());
    }

    @Test
    @DisplayName("a token that cannot be verified is left for the endpoint to refuse as it always has")
    void unverifiedTokenIsNotThisFiltersCall() throws Exception {
        when(auth.getCurrentUser(any())).thenThrow(new AuthException("Supabase session is invalid or expired."));
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request("GET", "Bearer expired"), response, chain);

        assertNotNull(chain.getRequest());
        assertEquals(200, response.getStatus());
    }

    @Test
    @DisplayName("requests without a token, and preflights, are not looked up at all")
    void anonymousAndPreflightAreSkipped() throws Exception {
        filter.doFilter(request("GET", null), new MockHttpServletResponse(), new MockFilterChain());
        filter.doFilter(request("OPTIONS", "Bearer token"), new MockHttpServletResponse(), new MockFilterChain());

        verify(auth, never()).getCurrentUser(any());
    }
}
