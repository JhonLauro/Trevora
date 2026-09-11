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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The app-wide AI spend ceiling: that it refuses at the limit, that the arithmetic
 * behind "the limit" is right, and that the alarm rings once rather than never or
 * on every call.
 */
class AiSpendGuardTest {

    private static final Instant NOW = Instant.parse("2026-09-11T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 11);

    private final List<String> alerts = new ArrayList<>();
    private final AiSpendLedger ledger = new AiSpendLedger(null, null);

    /** Daily $1, monthly $5; chat at $2.50 in / $10 out per million; transcription $0.006/min; Vision $1.50/1000. */
    private AiSpendGuard guard(boolean enabled) {
        AiSpendProperties properties = new AiSpendProperties(
                enabled,
                new BigDecimal("1.00"),
                new BigDecimal("5.00"),
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
    @DisplayName("paid calls are allowed until today's estimated spend reaches the daily limit, then refused")
    void refusesAtTheDailyLimit() {
        AiSpendGuard guard = guard(true);
        guard.recordChat("receipt-extraction", 0, 99_999); // $0.99999

        assertThat(guard.canSpend()).isTrue();

        guard.recordChat("receipt-extraction", 0, 1); // exactly $1.00
        assertThat(guard.canSpend()).isFalse();
        assertThatThrownBy(() -> guard.requireBudget("receipt-ocr"))
                .isInstanceOf(AiBudgetExceededException.class)
                .hasMessageContaining("today")
                .hasMessageContaining("typing it in");
    }

    @Test
    @DisplayName("the monthly limit binds even on a day that has spent nothing")
    void refusesAtTheMonthlyLimit() {
        AiSpendGuard guard = guard(true);
        ledger.add(TODAY.minusDays(3), "receipt-extraction", 1, 0, 0, 0, 5_000_000); // $5 earlier this month

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
        ledger.add(TODAY.withDayOfMonth(1).minusDays(1), "receipt-extraction", 1, 0, 0, 0, 50_000_000);

        assertThat(guard.canSpend()).isTrue();
    }

    @Test
    @DisplayName("a disabled budget never refuses")
    void disabledNeverRefuses() {
        AiSpendGuard guard = guard(false);
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
    @DisplayName("each threshold alerts once, not on every call after it")
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
        unlimited.recordChat("receipt-extraction", 100_000_000, 100_000_000);

        assertThat(unlimited.canSpend()).isTrue();
    }
}
