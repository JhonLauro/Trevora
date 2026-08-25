package com.trevora.api.shared.config;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Liveness probe for the platform health check. Deliberately touches no
 * database or Supabase call: it answers "the process is up and serving HTTP",
 * which is the only question a restart-on-failure check should ask.
 */
@RestController
public class HealthController {

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }
}
