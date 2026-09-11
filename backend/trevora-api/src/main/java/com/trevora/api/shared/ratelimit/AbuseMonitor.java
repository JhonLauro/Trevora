package com.trevora.api.shared.ratelimit;

import com.trevora.api.features.auth.AccountStandingService;
import com.trevora.api.shared.aibudget.AiSpendGuard;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Notices an account spamming the paid receipt reader, and escalates: a
 * warning, then a final warning, then suspension.
 *
 * <p><b>What counts.</b> Only requests the rate limiter has already refused. An
 * owner uploading lots of photos is never refused while the pages fit their
 * hour, and the receipt screen will not even send an upload that would not fit,
 * so refusals do not come from people using the app. Repeated refusals come from
 * something ignoring the answer -- a script, or the API called directly.
 *
 * <p><b>A strike</b> is {@code refusals-per-strike} refusals (5) inside
 * {@code window-minutes} (10). One burst is one strike however long it goes on:
 * after a strike, a further strike needs {@code strike-spacing-minutes} (30) to
 * have passed, and until then the account keeps getting the warning it already
 * has. Strikes are remembered for {@code strike-memory-days} (30).
 *
 * <ol>
 *   <li>first strike: warning;</li>
 *   <li>second strike: final warning -- one more and the account is suspended;</li>
 *   <li>third strike: the account is suspended, and every signed-in request from
 *       it is refused with the reason (see {@link AccountStandingService}).</li>
 * </ol>
 *
 * <p>Every strike raises an alert through the AI spend alert channel (the log,
 * and {@code TREVORA_AI_ALERT_WEBHOOK_URL} when set), naming the account.
 *
 * <p>Refusal counts are kept in memory, like the rate limiter's buckets; strikes
 * and suspensions are kept in the database.
 */
@Component
public class AbuseMonitor {
    private static final Logger log = LoggerFactory.getLogger(AbuseMonitor.class);

    public enum Outcome { NONE, WARNING, FINAL_WARNING, SUSPENDED }

    static final String WARNING_CODE = "ABUSE_WARNING";
    static final String FINAL_WARNING_CODE = "ABUSE_FINAL_WARNING";

    static final String WARNING_MESSAGE = "Unusual activity: this account sent a lot of receipt uploads that were "
            + "refused in a short time. Please slow down. If it keeps happening, your account may be suspended.";
    static final String FINAL_WARNING_MESSAGE = "Final warning: this account is still sending receipt uploads that "
            + "are being refused. If it happens again, your account will be suspended.";
    static final String SUSPENSION_REASON = "It kept sending automated receipt uploads after two warnings.";

    private final boolean enabled;
    private final int refusalsPerStrike;
    private final Duration window;
    private final Duration strikeSpacing;
    private final Duration strikeMemory;
    private final AccountStandingService accountStanding;
    private final Consumer<String> alertSink;
    private final Clock clock;
    private final Map<UUID, Deque<Instant>> refusals = new ConcurrentHashMap<>();

    @Autowired
    public AbuseMonitor(
            @Value("${trevora.abuse.enabled:true}") boolean enabled,
            @Value("${trevora.abuse.refusals-per-strike:5}") int refusalsPerStrike,
            @Value("${trevora.abuse.window-minutes:10}") long windowMinutes,
            @Value("${trevora.abuse.strike-spacing-minutes:30}") long strikeSpacingMinutes,
            @Value("${trevora.abuse.strike-memory-days:30}") long strikeMemoryDays,
            AccountStandingService accountStanding,
            AiSpendGuard spendGuard
    ) {
        this(enabled, refusalsPerStrike, Duration.ofMinutes(windowMinutes), Duration.ofMinutes(strikeSpacingMinutes),
                Duration.ofDays(strikeMemoryDays), accountStanding, spendGuard::alert, Clock.systemUTC());
    }

    AbuseMonitor(
            boolean enabled,
            int refusalsPerStrike,
            Duration window,
            Duration strikeSpacing,
            Duration strikeMemory,
            AccountStandingService accountStanding,
            Consumer<String> alertSink,
            Clock clock
    ) {
        this.enabled = enabled;
        this.refusalsPerStrike = Math.max(1, refusalsPerStrike);
        this.window = window;
        this.strikeSpacing = strikeSpacing;
        this.strikeMemory = strikeMemory;
        this.accountStanding = accountStanding;
        this.alertSink = alertSink;
        this.clock = clock;
    }

    /** Never strikes anyone: for code built outside Spring. */
    public static AbuseMonitor disabled() {
        return new AbuseMonitor(false, 1, Duration.ZERO, Duration.ZERO, Duration.ZERO,
                AccountStandingService.inMemory(), message -> { }, Clock.systemUTC());
    }

    /** Counts one refused request from this account, and says what it has earned. */
    public Outcome recordRefusal(UUID userId, String feature) {
        if (!enabled || userId == null) {
            return Outcome.NONE;
        }
        Instant now = clock.instant();
        if (refusals.size() > 10_000) {
            refusals.clear();
        }

        int count;
        Deque<Instant> recent = refusals.computeIfAbsent(userId, id -> new ArrayDeque<>());
        synchronized (recent) {
            recent.addLast(now);
            Instant cutoff = now.minus(window);
            while (!recent.isEmpty() && recent.peekFirst().isBefore(cutoff)) {
                recent.removeFirst();
            }
            count = recent.size();
            if (count < refusalsPerStrike) {
                return Outcome.NONE;
            }
            recent.clear();
        }

        List<AccountStandingService.Strike> strikes = accountStanding.strikesSince(userId, now.minus(strikeMemory));
        if (!strikes.isEmpty() && strikes.get(0).createdAt().isAfter(now.minus(strikeSpacing))) {
            // The same burst as the last strike: repeat that warning rather than escalate within seconds.
            return outcomeFor(strikes.get(0).level());
        }

        int level = Math.min(3, strikes.stream().mapToInt(AccountStandingService.Strike::level).max().orElse(0) + 1);
        accountStanding.addStrike(userId, feature, level, count);

        if (level >= 3) {
            accountStanding.suspend(userId, SUSPENSION_REASON);
            log.warn("Suspended account {} after a third strike for spamming {}", userId, feature);
            alertSink.accept(String.format(
                    "Account user:%s was SUSPENDED for spamming %s after two warnings (%d refused requests within "
                            + "%d minutes). To lift it, clear users.suspended_at and delete its account_strikes.",
                    userId, feature, count, window.toMinutes()));
            return Outcome.SUSPENDED;
        }

        log.warn("Account {} given strike {} for spamming {}", userId, level, feature);
        alertSink.accept(String.format(
                "Account user:%s was given a %s for spamming %s (%d refused requests within %d minutes).",
                userId, level == 1 ? "warning" : "final warning", feature, count, window.toMinutes()));
        return outcomeFor(level);
    }

    public String suspensionMessage() {
        return AccountStandingService.messageFor(SUSPENSION_REASON);
    }

    private static Outcome outcomeFor(int level) {
        return switch (level) {
            case 1 -> Outcome.WARNING;
            case 2 -> Outcome.FINAL_WARNING;
            default -> Outcome.SUSPENDED;
        };
    }
}
