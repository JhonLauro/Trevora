package com.trevora.api.shared.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.Refill;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Token buckets keyed by caller, in process memory.
 *
 * <p>In memory is a deliberate limit, not an oversight: run two instances and
 * each enforces its own copy, so the effective ceiling is the configured one
 * times the instance count. That is fine for what this defends against -- a
 * caller looping an endpoint that costs us an OpenAI request -- and the hard
 * per-session ceiling that has to hold exactly lives in the database instead.
 * Moving these to Redis is the change to make when we run more than one
 * instance and care about the exact number.
 */
@Component
public class AiRateLimiter {
    private final AiRateLimitProperties properties;
    private final Map<String, TrackedBucket> buckets = new ConcurrentHashMap<>();

    public AiRateLimiter(AiRateLimitProperties properties) {
        this.properties = properties;
    }

    /**
     * Spends one call against {@code key}. The returned decision carries the
     * seconds until a token is free again so the caller can send a truthful
     * {@code Retry-After} rather than a guess.
     */
    public Decision tryConsume(String key) {
        if (!properties.isEnabled()) {
            return Decision.allow();
        }

        evictIfCrowded();
        TrackedBucket tracked = buckets.compute(key, (ignored, existing) -> {
            TrackedBucket bucket = existing == null ? new TrackedBucket(newBucket()) : existing;
            bucket.lastSeen = Instant.now();
            return bucket;
        });

        ConsumptionProbe probe = tracked.bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            return Decision.allow();
        }
        long retryAfterSeconds = Math.max(1L, probe.getNanosToWaitForRefill() / 1_000_000_000L);
        return Decision.deny(retryAfterSeconds);
    }

    private Bucket newBucket() {
        return Bucket.builder()
                /*
                 * Two bandwidths on one bucket: the minute limit stops a burst
                 * from spiking the bill or holding every request thread, and
                 * the daily one stops a slow drip that would stay under the
                 * minute limit forever. A call has to satisfy both.
                 */
                .addLimit(Bandwidth.classic(
                        properties.getPerMinute(),
                        Refill.greedy(properties.getPerMinute(), Duration.ofMinutes(1))))
                .addLimit(Bandwidth.classic(
                        properties.getPerDay(),
                        Refill.greedy(properties.getPerDay(), Duration.ofDays(1))))
                .build();
    }

    /*
     * The map is unbounded otherwise, which would make the rate limiter its own
     * memory-exhaustion vector. Oldest-first so an active caller keeps its
     * bucket and cannot shed a limit by waiting out a sweep.
     */
    private void evictIfCrowded() {
        int max = properties.getMaxTrackedKeys();
        if (buckets.size() <= max) {
            return;
        }
        List<Map.Entry<String, TrackedBucket>> oldestFirst = buckets.entrySet().stream()
                .sorted(Comparator.comparing(entry -> entry.getValue().lastSeen))
                .toList();
        int removeCount = buckets.size() - (max / 2);
        for (int index = 0; index < removeCount && index < oldestFirst.size(); index++) {
            buckets.remove(oldestFirst.get(index).getKey());
        }
    }

    private static final class TrackedBucket {
        private final Bucket bucket;
        private volatile Instant lastSeen;

        private TrackedBucket(Bucket bucket) {
            this.bucket = bucket;
            this.lastSeen = Instant.now();
        }
    }

    public record Decision(boolean allowed, long retryAfterSeconds) {
        static Decision allow() {
            return new Decision(true, 0L);
        }

        static Decision deny(long retryAfterSeconds) {
            return new Decision(false, retryAfterSeconds);
        }
    }
}
