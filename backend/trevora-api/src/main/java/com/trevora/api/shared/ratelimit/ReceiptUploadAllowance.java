package com.trevora.api.shared.ratelimit;

import com.trevora.api.features.auth.AccountStandingService;
import com.trevora.api.features.auth.CurrentUserService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The owner's receipt page allowance: what {@code AiRateLimitFilter} charges a
 * receipt upload, and what the receipt screen reads to know whether an upload
 * fits before sending it.
 *
 * <p>Both read the same windows on the same key, so what the screen says and
 * the limit the server enforces cannot drift apart. The hour and the day are
 * fixed windows -- the whole allowance comes back at once when the window ends
 * -- so the screen can say plainly when to come back.
 *
 * <p>The key is {@code receipt:user:<id>}, the one the filter builds for a
 * signed-in caller.
 */
@Component
public class ReceiptUploadAllowance {
    private static final Duration WARNING_SHOWN_FOR = Duration.ofHours(24);

    private final AiRateLimiter rateLimiter;
    private final AiFeatureLimits featureLimits;
    private final CurrentUserService currentUserService;
    private final AccountStandingService accountStanding;
    private final int maxPagesPerUpload;

    public ReceiptUploadAllowance(
            AiRateLimiter rateLimiter,
            AiFeatureLimits featureLimits,
            CurrentUserService currentUserService,
            AccountStandingService accountStanding,
            @Value("${trevora.receipt.max-pages:10}") int maxPagesPerUpload
    ) {
        this.rateLimiter = rateLimiter;
        this.featureLimits = featureLimits;
        this.currentUserService = currentUserService;
        this.accountStanding = accountStanding;
        this.maxPagesPerUpload = maxPagesPerUpload;
    }

    /** The windows a receipt upload of {@code pages} pages is charged against, in the filter's order. */
    static List<AiRateLimiter.Window> windows(AiFeatureLimits.ReceiptLimit limit, long pages) {
        return List.of(
                new AiRateLimiter.Window(AiRateLimitFilter.MINUTE, limit.uploadsPerMinute(), Duration.ofMinutes(1), 1),
                new AiRateLimiter.Window(AiRateLimitFilter.HOUR, limit.pagesPerHour(), Duration.ofHours(1), pages, true),
                new AiRateLimiter.Window(AiRateLimitFilter.DAY, limit.pagesPerDay(), Duration.ofDays(1), pages, true));
    }

    static String keyFor(String callerKey) {
        return AiFeatureLimits.Feature.RECEIPT.key() + ":" + callerKey;
    }

    private String keyFor(UUID userId) {
        return keyFor("user:" + userId);
    }

    /**
     * What the signed-in owner has left of their receipt pages, when each window
     * resets, and whether the account was warned for spamming in the last day.
     */
    public ReceiptUsageResponse usageForCurrentUser() {
        currentUserService.requireVehicleOwner();
        UUID userId = currentUserService.getCurrentUserId();
        AiFeatureLimits.ReceiptLimit limit = featureLimits.receiptLimit();
        List<AiRateLimiter.WindowState> states = rateLimiter.peek(keyFor(userId), windows(limit, 1));
        AiRateLimiter.WindowState hour = states.get(1);
        AiRateLimiter.WindowState day = states.get(2);
        int pagesLeft = (int) Math.max(0, Math.min(hour.capacity() - hour.used(), day.capacity() - day.used()));
        Instant now = Instant.now();
        int warningLevel = accountStanding.strikesSince(userId, now.minus(WARNING_SHOWN_FOR)).stream()
                .mapToInt(AccountStandingService.Strike::level)
                .max()
                .orElse(0);
        return new ReceiptUsageResponse(
                (int) hour.capacity(), (int) hour.used(), hour.resetsAt(),
                (int) day.capacity(), (int) day.used(), day.resetsAt(),
                pagesLeft, maxPagesPerUpload, Math.min(2, warningLevel), now);
    }

    /**
     * Gives the owner back an upload that cost nothing -- the same pages again,
     * answered with the draft they had already made. Counting it would take pages
     * off their allowance for a read that never happened.
     */
    public void refundForCurrentUser(int pages) {
        rateLimiter.refund(
                keyFor(currentUserService.getCurrentUserId()),
                windows(featureLimits.receiptLimit(), Math.max(1, pages)));
    }

    /**
     * @param hourResetsAt when the hour's full allowance comes back; null when none of it is used
     * @param dayResetsAt  likewise for the day
     * @param pagesLeft    the most pages the next upload may carry, whichever window is tighter
     * @param warningLevel 1 when the account was warned for spamming in the last 24 hours, 2 for a final warning
     * @param serverTime   the server's clock, so the page can count down without trusting the device's
     */
    public record ReceiptUsageResponse(
            int pagesPerHour,
            int pagesUsedThisHour,
            Instant hourResetsAt,
            int pagesPerDay,
            int pagesUsedToday,
            Instant dayResetsAt,
            int pagesLeft,
            int maxPagesPerUpload,
            int warningLevel,
            Instant serverTime
    ) {
    }
}
