package com.trevora.api.shared.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.EstimationProbe;
import io.github.bucket4j.Refill;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
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
 * instance and care about the exact number. It also means a restart gives
 * everyone a fresh allowance; the spend limits in {@code AiSpendGuard}, which
 * are kept in the database, are what hold across restarts.
 */
@Component
public class AiRateLimiter {
    private final AiRateLimitProperties properties;
    private final Map<String, TrackedBuckets> buckets = new ConcurrentHashMap<>();

    public AiRateLimiter(AiRateLimitProperties properties) {
        this.properties = properties;
    }

    /**
     * One limit on a key: at most {@code capacity} units per {@code period}, with
     * each request costing {@code cost} units. The {@code name} is handed back
     * when this window is the one that refused, so the caller can say which
     * limit was reached.
     *
     * <p>{@code fixed} decides how the window refills. A gradual window gets its
     * units back a little at a time, which is right for burst limits nobody sees.
     * A fixed window gets all of them back at once when the period ends, which is
     * right for a limit shown to the owner: "18 of 30 used, resets at 3:42" is a
     * sentence a person can plan around, and a count that creeps back one page
     * every two minutes is not.
     */
    public record Window(String name, long capacity, Duration period, long cost, boolean fixed) {
        public Window(String name, long capacity, Duration period, long cost) {
            this(name, capacity, period, cost, false);
        }
    }

    /** How much of a window is used, and when it is whole again -- null when nothing is used. */
    public record WindowState(String name, long capacity, long used, Instant resetsAt) {
    }

    /**
     * Spends one call against {@code key}. The returned decision carries the
     * seconds until a token is free again so the caller can send a truthful
     * {@code Retry-After} rather than a guess.
     */
    public Decision tryConsume(String key) {
        return tryConsume(key, properties.getPerMinute(), properties.getPerDay());
    }

    /** Spends one call against {@code key} under a per-minute and a per-day limit of its own. */
    public Decision tryConsume(String key, int perMinute, int perDay) {
        return tryConsume(key, List.of(
                new Window("minute", Math.max(1, perMinute), Duration.ofMinutes(1), 1),
                new Window("day", Math.max(1, perDay), Duration.ofDays(1), 1)));
    }

    /**
     * Spends against every window of {@code key} at once, or against none of
     * them: a request refused by one window is not charged to the others. A key
     * keeps the windows it was first used with, so a key must always be used
     * with the same shape of windows -- which holds when the key names its
     * feature, as the filter's do. Costs may differ from request to request.
     */
    public Decision tryConsume(String key, List<Window> windows) {
        if (!properties.isEnabled() || windows.isEmpty()) {
            return Decision.allow();
        }

        evictIfCrowded();
        TrackedBuckets tracked = buckets.compute(key, (ignored, existing) -> {
            TrackedBuckets entry = existing == null ? new TrackedBuckets(windows) : existing;
            entry.lastSeen = Instant.now();
            return entry;
        });

        synchronized (tracked) {
            long longestWaitNanos = 0;
            String refusedBy = null;
            int count = Math.min(windows.size(), tracked.buckets.size());
            for (int index = 0; index < count; index++) {
                EstimationProbe probe = tracked.buckets.get(index).estimateAbilityToConsume(costOf(windows.get(index)));
                if (!probe.canBeConsumed() && probe.getNanosToWaitForRefill() >= longestWaitNanos) {
                    longestWaitNanos = probe.getNanosToWaitForRefill();
                    refusedBy = windows.get(index).name();
                }
            }
            if (refusedBy != null) {
                return Decision.deny(Math.max(1L, (long) Math.ceil(longestWaitNanos / 1_000_000_000.0)), refusedBy);
            }
            for (int index = 0; index < count; index++) {
                tracked.buckets.get(index).tryConsume(costOf(windows.get(index)));
            }
            return Decision.allow();
        }
    }

    /**
     * What {@code key} has used of each window, without spending anything or
     * creating a bucket. A key that has never been charged has used nothing.
     */
    public List<WindowState> peek(String key, List<Window> windows) {
        TrackedBuckets tracked = properties.isEnabled() ? buckets.get(key) : null;
        Instant now = Instant.now();
        List<WindowState> states = new ArrayList<>();
        for (int index = 0; index < windows.size(); index++) {
            Window window = windows.get(index);
            long capacity = Math.max(1, window.capacity());
            if (tracked == null || index >= tracked.buckets.size()) {
                states.add(new WindowState(window.name(), capacity, 0, null));
                continue;
            }
            synchronized (tracked) {
                Bucket bucket = tracked.buckets.get(index);
                long available = Math.max(0, Math.min(capacity, bucket.getAvailableTokens()));
                long used = capacity - available;
                Instant resetsAt = used == 0
                        ? null
                        : now.plusNanos(bucket.estimateAbilityToConsume(capacity).getNanosToWaitForRefill());
                states.add(new WindowState(window.name(), capacity, used, resetsAt));
            }
        }
        return states;
    }

    /**
     * Gives back what a request was charged, for a request that turned out to
     * cost nothing. Never raises a window above its capacity.
     */
    public void refund(String key, List<Window> windows) {
        TrackedBuckets tracked = buckets.get(key);
        if (tracked == null) {
            return;
        }
        synchronized (tracked) {
            int count = Math.min(windows.size(), tracked.buckets.size());
            for (int index = 0; index < count; index++) {
                tracked.buckets.get(index).addTokens(costOf(windows.get(index)));
            }
        }
    }

    // A request larger than a window could never pass it; it is charged the whole window instead.
    private static long costOf(Window window) {
        return Math.max(1, Math.min(window.cost(), Math.max(1, window.capacity())));
    }

    private static Bucket newBucket(Window window) {
        long capacity = Math.max(1, window.capacity());
        /*
         * One bucket per window rather than several bandwidths on one bucket, so
         * that a refusal can say which limit it was: a burst limit means wait a
         * moment, a daily one means come back tomorrow.
         */
        Refill refill = window.fixed()
                ? Refill.intervally(capacity, window.period())
                : Refill.greedy(capacity, window.period());
        return Bucket.builder()
                .addLimit(Bandwidth.classic(capacity, refill))
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
        List<Map.Entry<String, TrackedBuckets>> oldestFirst = buckets.entrySet().stream()
                .sorted(Comparator.comparing(entry -> entry.getValue().lastSeen))
                .toList();
        int removeCount = buckets.size() - (max / 2);
        for (int index = 0; index < removeCount && index < oldestFirst.size(); index++) {
            buckets.remove(oldestFirst.get(index).getKey());
        }
    }

    private static final class TrackedBuckets {
        private final List<Bucket> buckets = new ArrayList<>();
        private volatile Instant lastSeen;

        private TrackedBuckets(List<Window> windows) {
            windows.forEach(window -> buckets.add(newBucket(window)));
            this.lastSeen = Instant.now();
        }
    }

    /** {@code refusedBy} names the window that refused, or is null when allowed. */
    public record Decision(boolean allowed, long retryAfterSeconds, String refusedBy) {
        static Decision allow() {
            return new Decision(true, 0L, null);
        }

        static Decision deny(long retryAfterSeconds, String refusedBy) {
            return new Decision(false, retryAfterSeconds, refusedBy);
        }
    }
}
