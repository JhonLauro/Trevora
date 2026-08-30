package com.trevora.api.shared.config;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

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

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        List<String> origins = resolveOrigins();
        log.info("CORS allows {}", origins);

        registry.addMapping("/api/**")
                .allowedOriginPatterns(origins.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*");
    }

    /** Split out from the registry call so the decision can be tested directly. */
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
