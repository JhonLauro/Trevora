package com.trevora.api.shared.aibudget;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Limits on AI spend: that one caller is paused at their own limit while everyone
 * else carries on, that the app-wide backstop still holds, that the arithmetic
 * behind "the limit" is right, and that the alarm rings once rather than never or
 * on every call.
 */
class AiSpendGuardTest {

    private static final Instant NOW = Instant.parse("2026-09-11T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 11);

    private final List<String> alerts = new ArrayList<>();
    private final AiSpendLedger ledger = new AiSpendLedger(null, null);

    @AfterEach
    void clearCaller() {
        AiSpendContext.clear();
    }

    /**
     * App-wide: $1 a day, $5 a month. Per caller: $0.50 a day. Chat at $2.50 in /
     * $10 out per million; transcription $0.006/min; Vision $1.50/1000 pages.
     */
    private AiSpendGuard guard(boolean enabled) {
        AiSpendProperties properties = new AiSpendProperties(
                enabled,
                new BigDecimal("1.00"),
                new BigDecimal("5.00"),
                new BigDecimal("0.50"),
                new BigDecimal("2.50"),
                new BigDecimal("10.00"),
                new BigDecimal("0.006"),
                new BigDecimal("1.50"),
                "");
        return new AiSpendGuard(properties, ledger, Clock.fixed(NOW, ZoneOffset.UTC), alerts::add);
    }

    private long spentToday() {
        return ledger.spentMicros(TODAY, TODAY);
    }

    @Test
    @DisplayName("one caller reaching their own daily limit is paused, and other callers are not")
    void oneCallerIsPausedAlone() {
        AiSpendGuard guard = guard(true);

        AiSpendContext.set("user:spammer");
        guard.recordChat("receipt-extraction", 0, 50_000); // $0.50, the per-caller limit
        assertThat(guard.canSpend()).isFalse();
        assertThatThrownBy(() -> guard.requireBudget("receipt-ocr"))
                .isInstanceOf(AiBudgetExceededException.class)
                .hasMessageContaining("your account")
                .hasMessageContaining("typing it in");

        AiSpendContext.set("user:everyone-else");
        assertThat(guard.canSpend()).isTrue();
        guard.requireBudget("receipt-ocr");
    }

    @Test
    @DisplayName("a caller's spend on one feature counts towards their limit on every feature")
    void callerLimitSpansFeatures() {
        AiSpendGuard guard = guard(true);
        AiSpendContext.set("user:owner");

        guard.recordChat("receipt-extraction", 0, 30_000); // $0.30
        assertThat(guard.canSpend()).isTrue();
        guard.recordChat("record-explanation", 0, 20_000); // +$0.20 = $0.50

        assertThat(guard.canSpend()).isFalse();
    }

    @Test
    @DisplayName("spend with no known caller counts towards the app total but pauses no one in particular")
    void unattributedSpendHasNoCallerLimit() {
        AiSpendGuard guard = guard(true);

        guard.recordChat("receipt-extraction", 0, 60_000); // $0.60, over a caller's limit, under the app's

        assertThat(guard.canSpend()).isTrue();
        assertThat(spentToday()).isEqualTo(600_000);
    }

    @Test
    @DisplayName("the app-wide daily backstop still pauses everyone")
    void refusesAtTheAppDailyLimit() {
        AiSpendGuard guard = guard(true);
        ledger.add(TODAY, "receipt-extraction", "user:a", 1, 0, 0, 0, 400_000);
        ledger.add(TODAY, "receipt-extraction", "user:b", 1, 0, 0, 0, 400_000);
        ledger.add(TODAY, "receipt-extraction", "user:c", 1, 0, 0, 0, 200_000); // $1.00 in total

        AiSpendContext.set("user:d"); // a caller who has spent nothing
        assertThat(guard.canSpend()).isFalse();
        assertThatThrownBy(() -> guard.requireBudget("receipt-ocr"))
                .isInstanceOf(AiBudgetExceededException.class)
                .hasMessageContaining("today");
    }

    @Test
    @DisplayName("the monthly limit binds even on a day that has spent nothing")
    void refusesAtTheMonthlyLimit() {
        AiSpendGuard guard = guard(true);
        ledger.add(TODAY.minusDays(3), "receipt-extraction", AiSpendContext.UNATTRIBUTED, 1, 0, 0, 0, 5_000_000);

        assertThat(spentToday()).isZero();
        assertThat(guard.canSpend()).isFalse();
        assertThatThrownBy(() -> guard.requireBudget("voice-transcription"))
                .isInstanceOf(AiBudgetExceededException.class)
                .hasMessageContaining("this month");
    }

    @Test
    @DisplayName("spend from last month does not count against this month")
    void lastMonthDoesNotCount() {
        AiSpendGuard guard = guard(true);
        ledger.add(TODAY.withDayOfMonth(1).minusDays(1), "receipt-extraction", "user:a", 1, 0, 0, 0, 50_000_000);

        AiSpendContext.set("user:a");
        assertThat(guard.canSpend()).isTrue();
    }

    @Test
    @DisplayName("a disabled budget never refuses")
    void disabledNeverRefuses() {
        AiSpendGuard guard = guard(false);
        AiSpendContext.set("user:a");
        guard.recordChat("receipt-extraction", 10_000_000, 10_000_000);

        assertThat(guard.canSpend()).isTrue();
        guard.requireBudget("receipt-ocr");
    }

    @Test
    @DisplayName("chat cost is tokens times the price per million, input and output priced separately")
    void chatCostArithmetic() {
        AiSpendGuard guard = guard(true);
        guard.recordChatResponse("record-explanation",
                "{\"usage\":{\"prompt_tokens\":1000,\"completion_tokens\":200}}");

        // 1000 x $2.50/M = $0.0025 ; 200 x $10/M = $0.002
        assertThat(spentToday()).isEqualTo(2_500 + 2_000);
    }

    @Test
    @DisplayName("a response with no usage block is charged a large receipt's worth, never nothing")
    void missingUsageIsNotFree() {
        AiSpendGuard guard = guard(true);
        guard.recordChatResponse("mechanic-search", "{\"choices\":[]}");

        long expected = AiSpendGuard.FALLBACK_INPUT_TOKENS * 2_500 / 1_000
                + AiSpendGuard.FALLBACK_OUTPUT_TOKENS * 10;
        assertThat(spentToday()).isEqualTo(expected);
    }

    @Test
    @DisplayName("Vision is priced per page, transcription per minute")
    void visionAndTranscriptionArithmetic() {
        AiSpendGuard guard = guard(true);
        guard.recordVisionPages("receipt-ocr", 4); // 4 x $0.0015
        assertThat(spentToday()).isEqualTo(6_000);

        guard.recordTranscription("voice-transcription", 1, "{\"usage\":{\"seconds\":120}}"); // 2 min x $0.006
        assertThat(spentToday()).isEqualTo(6_000 + 12_000);
    }

    @Test
    @DisplayName("a transcription with no reported length is estimated from its size, generously")
    void transcriptionEstimatedFromSize() {
        AiSpendGuard guard = guard(true);
        long bytes = AiSpendGuard.ASSUMED_AUDIO_BYTES_PER_SECOND * 60; // one minute at the assumed bitrate

        guard.recordTranscription("voice-transcription", bytes, "{\"text\":\"hello\"}");

        assertThat(spentToday()).isEqualTo(6_000);
    }

    @Test
    @DisplayName("each app-wide threshold alerts once, not on every call after it")
    void alertsFireOncePerThreshold() {
        AiSpendGuard guard = guard(true);

        guard.recordChat("receipt-extraction", 0, 50_000); // $0.50 -> 50% of daily
        guard.recordChat("receipt-extraction", 0, 1);
        // $0.50 inside one hour is also an unusual hour, which is a separate alert.
        assertThat(alerts).filteredOn(message -> message.startsWith("Estimated AI spend today"))
                .singleElement().asString().contains("50%");

        guard.recordChat("receipt-extraction", 0, 30_000); // $0.80 -> 80%
        assertThat(alerts).filteredOn(message -> message.startsWith("Estimated AI spend today"))
                .hasSize(2)
                .anyMatch(message -> message.contains("80%"));
        assertThat(alerts).filteredOn(message -> message.startsWith("Unusual AI spend")).hasSize(1);
    }

    @Test
    @DisplayName("a caller reaching their own limit raises one alert naming them")
    void callerLimitAlert() {
        AiSpendGuard guard = guard(true);
        AiSpendContext.set("user:spammer");

        guard.recordChat("receipt-extraction", 0, 50_000);
        guard.recordChat("receipt-extraction", 0, 1);

        assertThat(alerts).filteredOn(message -> message.startsWith("One caller"))
                .singleElement().asString().contains("user:spammer");
    }

    @Test
    @DisplayName("a quarter of a day's limit inside one hour raises the unusual-spend alert")
    void spikeAlert() {
        AiSpendGuard guard = guard(true);

        guard.recordChat("receipt-extraction", 0, 25_000); // $0.25 in one go

        assertThat(alerts).anyMatch(message -> message.startsWith("Unusual AI spend"));
    }

    @Test
    @DisplayName("the unlimited guard used outside Spring never refuses")
    void unlimitedNeverRefuses() {
        AiSpendGuard unlimited = AiSpendGuard.unlimited();
        AiSpendContext.set("user:a");
        unlimited.recordChat("receipt-extraction", 100_000_000, 100_000_000);

        assertThat(unlimited.canSpend()).isTrue();
    }
}
