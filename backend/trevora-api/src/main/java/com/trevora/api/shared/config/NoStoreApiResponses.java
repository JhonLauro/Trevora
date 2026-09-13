package com.trevora.api.shared.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Tells browsers not to keep API responses.
 *
 * <p>Responses carry owner data: records, receipt text, a mechanic's shared view
 * of someone else's history. Nothing set a cache header before this, so nothing
 * told a browser -- the owner's, or a mechanic's on a shop computer -- not to
 * keep a copy after the record was deleted or the session expired. Browsers
 * rarely cache responses like these, but rarely is not never.
 */
@Component
public class NoStoreApiResponses extends OncePerRequestFilter {

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        chain.doFilter(request, response);
    }
}
