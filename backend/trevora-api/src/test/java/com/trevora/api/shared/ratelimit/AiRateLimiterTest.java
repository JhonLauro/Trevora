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
}
