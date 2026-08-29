package com.trevora.api.shared.ratelimit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Limits applied to the endpoints that spend money with OpenAI and Google
 * Vision. Every value is a property so a deployment can loosen or tighten them
 * without a release, and so a load test can turn them off with
 * {@code TREVORA_AI_RATE_LIMIT_ENABLED=false} instead of editing code.
 */
@Component
public class AiRateLimitProperties {
    private final boolean enabled;
    private final int perMinute;
    private final int perDay;
    private final int maxTrackedKeys;

    public AiRateLimitProperties(
            @Value("${trevora.ai.rate-limit.enabled:true}") boolean enabled,
            @Value("${trevora.ai.rate-limit.per-minute:10}") int perMinute,
            @Value("${trevora.ai.rate-limit.per-day:100}") int perDay,
            @Value("${trevora.ai.rate-limit.max-tracked-keys:10000}") int maxTrackedKeys
    ) {
        this.enabled = enabled;
        this.perMinute = Math.max(1, perMinute);
        this.perDay = Math.max(1, perDay);
        this.maxTrackedKeys = Math.max(100, maxTrackedKeys);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public int getPerMinute() {
        return perMinute;
    }

    public int getPerDay() {
        return perDay;
    }

    public int getMaxTrackedKeys() {
        return maxTrackedKeys;
    }
}
