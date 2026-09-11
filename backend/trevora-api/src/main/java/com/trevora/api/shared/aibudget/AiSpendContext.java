package com.trevora.api.shared.aibudget;

/**
 * Who the paid AI call running on this thread is being spent for.
 *
 * <p>Set by {@code AiRateLimitFilter} for the length of each paid request, from the
 * caller it already identified to rate-limit, and cleared when the request ends.
 * {@link AiSpendGuard} reads it to charge the spend to that caller and to apply
 * their personal daily limit -- so the providers and services making the calls
 * need no idea who is asking.
 *
 * <p>A thread local is sound here because every paid call runs on the request's
 * own thread. Anything that ever moves one onto another thread must carry the
 * value across, or that spend is charged to nobody in particular.
 */
public final class AiSpendContext {
    static final String UNATTRIBUTED = "unattributed";

    private static final ThreadLocal<String> SPENDER = new ThreadLocal<>();

    private AiSpendContext() {
    }

    public static void set(String spender) {
        SPENDER.set(spender);
    }

    public static void clear() {
        SPENDER.remove();
    }

    /** The current caller, or {@code unattributed} outside a paid request. */
    public static String current() {
        String spender = SPENDER.get();
        return spender == null || spender.isBlank() ? UNATTRIBUTED : spender;
    }
}
