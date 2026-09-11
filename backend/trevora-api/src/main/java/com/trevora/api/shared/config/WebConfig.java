package com.trevora.api.shared.config;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
public class WebConfig {

    private static final Logger log = LoggerFactory.getLogger(WebConfig.class);

    private static final List<String> LOCALHOST_PATTERNS =
            List.of("http://localhost:*", "http://127.0.0.1:*");

    /**
     * Deployed frontend origins, comma-separated (e.g. the Render static site
     * URL and any custom domain).
     */
    @Value("${trevora.cors.allowed-origins:}")
    private String configuredOrigins;

    /**
     * Whether any localhost port may call this API.
     *
     * <p>Left unset it derives itself: a deployment that names its frontend
     * origins is a real one and does not need localhost; a machine that names
     * none is somebody's laptop and needs nothing else to work. Set it
     * explicitly ({@code true}/{@code false}) to override that reading.
     *
     * <p>Why bother, when the API is bearer-token only and an attacker's local
     * page still needs a valid token: an allowed origin is the browser's
     * permission to *read the response*. Keeping production's origin list to
     * the origins production actually has costs nothing and removes a class of
     * mistake -- the next feature that adds a cookie, or an endpoint that
     * answers before the token check, would be reachable from any page a
     * developer happens to be running.
     */
    @Value("${trevora.cors.allow-localhost:}")
    private String allowLocalhostSetting;

    /**
     * CORS as the first servlet filter, rather than as Spring MVC mappings.
     *
     * <p>It used to be {@code addCorsMappings}, which only applies to requests
     * that reach a controller. Responses written before that -- the rate
     * limiter's 429s, spam warnings, a suspended account's 403 -- went out with
     * no CORS headers, and the frontend runs on another origin, so the browser
     * would not let the page read them. The owner saw "Could not reach the
     * Trevora API" instead of the reason. As the first filter, every response
     * under /api carries the headers, whichever part of the app wrote it, and
     * preflights are answered here.
     */
    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilter() {
        List<String> origins = resolveOrigins();
        log.info("CORS allows {}", origins);

        FilterRegistrationBean<CorsFilter> registration =
                new FilterRegistrationBean<>(new CorsFilter(corsConfigurationSource(origins)));
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        registration.addUrlPatterns("/api/*");
        return registration;
    }

    /** The same rules {@code addCorsMappings} applied, for the filter. Public so the filter can be tested. */
    public static UrlBasedCorsConfigurationSource corsConfigurationSource(List<String> origins) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(origins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setMaxAge(1800L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }

    /** Split out from the filter so the decision can be tested directly. */
    List<String> resolveOrigins() {
        List<String> origins = new ArrayList<>();
        for (String origin : configuredOrigins.split(",")) {
            String trimmed = origin.trim();
            if (!trimmed.isEmpty()) {
                origins.add(trimmed);
            }
        }

        if (allowLocalhost(origins.isEmpty())) {
            origins.addAll(LOCALHOST_PATTERNS);
        }

        /*
         * An empty pattern list is not a lockdown -- Spring treats it as "no
         * CORS configured", which is harder to diagnose than a wrong origin.
         * If nothing at all was resolved, keep localhost so a misconfigured
         * server still works on a laptop, and say so loudly enough to notice
         * in the startup log.
         */
        if (origins.isEmpty()) {
            log.warn("No CORS origins configured and localhost is disabled; falling back to localhost. "
                    + "Set trevora.cors.allowed-origins to the frontend URL.");
            origins.addAll(LOCALHOST_PATTERNS);
        }

        return origins;
    }

    private boolean allowLocalhost(boolean noConfiguredOrigins) {
        String setting = allowLocalhostSetting == null ? "" : allowLocalhostSetting.trim();
        if (setting.isEmpty()) {
            return noConfiguredOrigins;
        }
        return Boolean.parseBoolean(setting);
    }
}
