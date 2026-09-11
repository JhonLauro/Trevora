package com.trevora.api.shared.aibudget;

import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * How much the whole app may spend on paid AI APIs, and the prices it estimates
 * that spend with.
 *
 * <p>Every value is an environment variable so the limits can be moved without a
 * release -- see {@code application.properties} for the names.
 *
 * <p><b>The prices default high on purpose.</b> They are the list prices of
 * gpt-4o, the most expensive model this app has ever used, so an estimate made
 * with them overstates what a mini model really costs rather than understating
 * it. Set them to the current prices of the models you actually run and the
 * estimate becomes accurate; leave them and the budget simply trips early. The
 * provider's billing page is still the record of what was charged -- this is a
 * brake, not an invoice.
 *
 * <p>A limit of zero with the budget enabled means no paid AI call is allowed
 * at all.
 */
@Component
public class AiSpendProperties {
    private final boolean enabled;
    private final long dailyLimitMicros;
    private final long monthlyLimitMicros;
    private final BigDecimal chatInputPerMillionUsd;
    private final BigDecimal chatOutputPerMillionUsd;
    private final BigDecimal transcriptionPerMinuteUsd;
    private final BigDecimal visionPerThousandUsd;
    private final String alertWebhookUrl;

    public AiSpendProperties(
            @Value("${trevora.ai.budget.enabled:true}") boolean enabled,
            @Value("${trevora.ai.budget.daily-usd:2.00}") BigDecimal dailyLimitUsd,
            @Value("${trevora.ai.budget.monthly-usd:25.00}") BigDecimal monthlyLimitUsd,
            @Value("${trevora.ai.price.chat-input-per-million-usd:2.50}") BigDecimal chatInputPerMillionUsd,
            @Value("${trevora.ai.price.chat-output-per-million-usd:10.00}") BigDecimal chatOutputPerMillionUsd,
            @Value("${trevora.ai.price.transcription-per-minute-usd:0.006}") BigDecimal transcriptionPerMinuteUsd,
            @Value("${trevora.ai.price.vision-per-thousand-usd:1.50}") BigDecimal visionPerThousandUsd,
            @Value("${trevora.ai.budget.alert-webhook-url:}") String alertWebhookUrl
    ) {
        this.enabled = enabled;
        this.dailyLimitMicros = toMicros(dailyLimitUsd);
        this.monthlyLimitMicros = toMicros(monthlyLimitUsd);
        this.chatInputPerMillionUsd = nonNegative(chatInputPerMillionUsd);
        this.chatOutputPerMillionUsd = nonNegative(chatOutputPerMillionUsd);
        this.transcriptionPerMinuteUsd = nonNegative(transcriptionPerMinuteUsd);
        this.visionPerThousandUsd = nonNegative(visionPerThousandUsd);
        this.alertWebhookUrl = alertWebhookUrl == null ? "" : alertWebhookUrl.trim();
    }

    /** No limit and no alerts: for code built outside Spring, such as tests. */
    static AiSpendProperties disabled() {
        return new AiSpendProperties(false, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, "");
    }

    private static BigDecimal nonNegative(BigDecimal value) {
        return value == null || value.signum() < 0 ? BigDecimal.ZERO : value;
    }

    static long toMicros(BigDecimal usd) {
        return nonNegative(usd).multiply(BigDecimal.valueOf(1_000_000)).setScale(0, RoundingMode.CEILING).longValue();
    }

    public boolean isEnabled() {
        return enabled;
    }

    public long dailyLimitMicros() {
        return dailyLimitMicros;
    }

    public long monthlyLimitMicros() {
        return monthlyLimitMicros;
    }

    public BigDecimal chatInputPerMillionUsd() {
        return chatInputPerMillionUsd;
    }

    public BigDecimal chatOutputPerMillionUsd() {
        return chatOutputPerMillionUsd;
    }

    public BigDecimal transcriptionPerMinuteUsd() {
        return transcriptionPerMinuteUsd;
    }

    public BigDecimal visionPerThousandUsd() {
        return visionPerThousandUsd;
    }

    public String alertWebhookUrl() {
        return alertWebhookUrl;
    }
}
