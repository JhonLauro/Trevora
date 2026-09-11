package com.trevora.api.shared.aibudget;

import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * How much paid AI spend is allowed, per caller and for the whole app, and the
 * prices that spend is estimated with.
 *
 * <p><b>Two kinds of limit, for two different jobs.</b> The per-caller daily limit
 * is the everyday one: it is what stops one account spamming uploads from wasting
 * tokens, and it pauses only that account. The app-wide daily and monthly limits
 * are a backstop against a bug or a crowd of throwaway accounts; set them well
 * above normal use, because reaching them pauses AI for everyone.
 *
 * <p>Every value is an environment variable -- see {@code application.properties}.
 *
 * <p><b>The prices default high on purpose.</b> They are gpt-4o's list prices, the
 * most expensive model this app has used, so the estimate overstates what a mini
 * model costs rather than understating it. Set them to the current prices of the
 * models actually in use and the estimate becomes accurate; leave them and every
 * limit trips earlier than the real spend would.
 *
 * <p>An app-wide limit of zero with the budget enabled allows no paid AI call at
 * all. A per-caller limit of zero turns the per-caller limit off.
 */
@Component
public class AiSpendProperties {
    private final boolean enabled;
    private final long dailyLimitMicros;
    private final long monthlyLimitMicros;
    private final long perUserDailyLimitMicros;
    private final BigDecimal chatInputPerMillionUsd;
    private final BigDecimal chatOutputPerMillionUsd;
    private final BigDecimal transcriptionPerMinuteUsd;
    private final BigDecimal visionPerThousandUsd;
    private final String alertWebhookUrl;

    public AiSpendProperties(
            @Value("${trevora.ai.budget.enabled:true}") boolean enabled,
            @Value("${trevora.ai.budget.daily-usd:5.00}") BigDecimal dailyLimitUsd,
            @Value("${trevora.ai.budget.monthly-usd:30.00}") BigDecimal monthlyLimitUsd,
            @Value("${trevora.ai.budget.per-user-daily-usd:1.50}") BigDecimal perUserDailyLimitUsd,
            @Value("${trevora.ai.price.chat-input-per-million-usd:2.50}") BigDecimal chatInputPerMillionUsd,
            @Value("${trevora.ai.price.chat-output-per-million-usd:10.00}") BigDecimal chatOutputPerMillionUsd,
            @Value("${trevora.ai.price.transcription-per-minute-usd:0.006}") BigDecimal transcriptionPerMinuteUsd,
            @Value("${trevora.ai.price.vision-per-thousand-usd:1.50}") BigDecimal visionPerThousandUsd,
            @Value("${trevora.ai.budget.alert-webhook-url:}") String alertWebhookUrl
    ) {
        this.enabled = enabled;
        this.dailyLimitMicros = toMicros(dailyLimitUsd);
        this.monthlyLimitMicros = toMicros(monthlyLimitUsd);
        this.perUserDailyLimitMicros = toMicros(perUserDailyLimitUsd);
        this.chatInputPerMillionUsd = nonNegative(chatInputPerMillionUsd);
        this.chatOutputPerMillionUsd = nonNegative(chatOutputPerMillionUsd);
        this.transcriptionPerMinuteUsd = nonNegative(transcriptionPerMinuteUsd);
        this.visionPerThousandUsd = nonNegative(visionPerThousandUsd);
        this.alertWebhookUrl = alertWebhookUrl == null ? "" : alertWebhookUrl.trim();
    }

    /** No limit and no alerts: for code built outside Spring, such as tests. */
    static AiSpendProperties disabled() {
        return new AiSpendProperties(false, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
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

    public long perUserDailyLimitMicros() {
        return perUserDailyLimitMicros;
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
