package com.trevora.api.shared.ratelimit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The limiter guards endpoints that spend money on every call, so the cases
 * that matter are the boundary (the call that should be the last one allowed)
 * and the isolation between callers -- a busy mechanic must not lock out an
 * unrelated vehicle owner.
 */
class AiRateLimiterTest {

    private static AiRateLimiter limiter(boolean enabled, int perMinute, int perDay) {
        return new AiRateLimiter(new AiRateLimitProperties(enabled, perMinute, perDay, 10_000));
    }

    @Test
    @DisplayName("allows exactly the configured burst, then denies")
    void allowsUpToTheMinuteLimit() {
        AiRateLimiter limiter = limiter(true, 3, 100);

        for (int call = 1; call <= 3; call++) {
            assertTrue(limiter.tryConsume("user:alice").allowed(), "call " + call + " should be allowed");
        }
        assertFalse(limiter.tryConsume("user:alice").allowed());
    }

    @Test
    @DisplayName("a denied call reports a positive Retry-After")
    void deniedCallCarriesRetryAfter() {
        AiRateLimiter limiter = limiter(true, 1, 100);
        limiter.tryConsume("user:alice");

        AiRateLimiter.Decision decision = limiter.tryConsume("user:alice");
        assertFalse(decision.allowed());
        assertTrue(decision.retryAfterSeconds() >= 1, "clients need a wait they can act on");
    }

    @Test
    @DisplayName("the daily cap binds even when the burst limit does not")
    void dailyCapBindsIndependently() {
        AiRateLimiter limiter = limiter(true, 100, 2);

        assertTrue(limiter.tryConsume("session:one").allowed());
        assertTrue(limiter.tryConsume("session:one").allowed());
        assertFalse(limiter.tryConsume("session:one").allowed(), "a slow drip must still hit the daily cap");
    }

    @Test
    @DisplayName("one caller exhausting its bucket does not affect another")
    void bucketsAreKeyedPerCaller() {
        AiRateLimiter limiter = limiter(true, 1, 100);
        limiter.tryConsume("user:alice");
        assertFalse(limiter.tryConsume("user:alice").allowed());

        assertTrue(limiter.tryConsume("user:bob").allowed());
    }

    @Test
    @DisplayName("disabled lets everything through")
    void disabledAllowsEverything() {
        AiRateLimiter limiter = limiter(false, 1, 1);

        for (int call = 0; call < 20; call++) {
            assertTrue(limiter.tryConsume("user:alice").allowed());
        }
    }

    @Test
    @DisplayName("nonsense configuration is floored rather than trusted")
    void configurationIsFloored() {
        AiRateLimitProperties properties = new AiRateLimitProperties(true, 0, -5, 1);

        assertEquals(1, properties.getPerMinute());
        assertEquals(1, properties.getPerDay());
        assertEquals(100, properties.getMaxTrackedKeys());
    }

    @Test
    @DisplayName("a key used with its own limits is held to those, not the defaults")
    void keysCanCarryTheirOwnLimits() {
        AiRateLimiter limiter = limiter(true, 100, 100);

        assertTrue(limiter.tryConsume("receipt:user:alice", 1, 30).allowed());
        assertFalse(limiter.tryConsume("receipt:user:alice", 1, 30).allowed(), "the receipt key allows one a minute");
        assertTrue(limiter.tryConsume("explanation:user:alice", 20, 200).allowed(), "another feature is untouched");
    }

    @Test
    @DisplayName("a request spends its cost from every window, and a refusal names the window that refused")
    void costsAndRefusingWindow() {
        AiRateLimiter limiter = limiter(true, 100, 100);
        java.util.List<AiRateLimiter.Window> nine = java.util.List.of(
                new AiRateLimiter.Window("minute", 10, java.time.Duration.ofMinutes(1), 1),
                new AiRateLimiter.Window("hour", 20, java.time.Duration.ofHours(1), 9));

        assertTrue(limiter.tryConsume("receipt:user:alice", nine).allowed());
        assertTrue(limiter.tryConsume("receipt:user:alice", nine).allowed());
        AiRateLimiter.Decision third = limiter.tryConsume("receipt:user:alice", nine);

        assertFalse(third.allowed(), "27 pages do not fit a 20-page hour");
        assertEquals("hour", third.refusedBy());
    }

    @Test
    @DisplayName("a refused request is not charged to the windows that would have allowed it")
    void refusedRequestsAreNotCharged() {
        AiRateLimiter limiter = limiter(true, 100, 100);
        java.util.function.IntFunction<java.util.List<AiRateLimiter.Window>> pages = count -> java.util.List.of(
                new AiRateLimiter.Window("minute", 2, java.time.Duration.ofMinutes(1), 1),
                new AiRateLimiter.Window("hour", 10, java.time.Duration.ofHours(1), count));

        assertTrue(limiter.tryConsume("k", pages.apply(5)).allowed());
        assertFalse(limiter.tryConsume("k", pages.apply(10)).allowed(), "only five pages are left in the hour");
        assertTrue(limiter.tryConsume("k", pages.apply(5)).allowed(), "the refused request did not use up the minute");
    }

    @Test
    @DisplayName("peek reports what a fixed window has used and when it comes back whole, without spending")
    void peekReportsUsageAndReset() {
        AiRateLimiter limiter = limiter(true, 100, 100);
        java.util.function.LongFunction<java.util.List<AiRateLimiter.Window>> pages = count -> java.util.List.of(
                new AiRateLimiter.Window("hour", 30, java.time.Duration.ofHours(1), count, true));

        AiRateLimiter.WindowState untouched = limiter.peek("receipt:user:alice", pages.apply(1)).get(0);
        assertEquals(0, untouched.used());
        assertEquals(null, untouched.resetsAt());

        limiter.tryConsume("receipt:user:alice", pages.apply(9));
        AiRateLimiter.WindowState afterNine = limiter.peek("receipt:user:alice", pages.apply(1)).get(0);
        AiRateLimiter.WindowState again = limiter.peek("receipt:user:alice", pages.apply(1)).get(0);

        assertEquals(9, afterNine.used());
        assertEquals(9, again.used(), "peeking spends nothing");
        long secondsToReset = java.time.Duration.between(java.time.Instant.now(), afterNine.resetsAt()).getSeconds();
        assertTrue(secondsToReset > 3_500 && secondsToReset <= 3_600, "resets when the hour ends: " + secondsToReset);
    }

    @Test
    @DisplayName("a refund gives back what a request was charged, and no more than the window holds")
    void refundGivesPagesBack() {
        AiRateLimiter limiter = limiter(true, 100, 100);
        java.util.function.LongFunction<java.util.List<AiRateLimiter.Window>> pages = count -> java.util.List.of(
                new AiRateLimiter.Window("hour", 30, java.time.Duration.ofHours(1), count, true));

        limiter.tryConsume("k", pages.apply(9));
        limiter.refund("k", pages.apply(9));
        limiter.refund("k", pages.apply(9));

        assertEquals(0, limiter.peek("k", pages.apply(1)).get(0).used());
    }
}
