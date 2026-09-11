package com.trevora.api.shared.aibudget;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Limits on paid AI spend -- per caller and for the whole app -- and the alarm
 * that goes off near them.
 *
 * <p>Every class that calls OpenAI or Google Vision asks {@link #canSpend} or
 * {@link #requireBudget} before the call and reports what the call used
 * afterwards; {@code PaidCallsAreGuardedTest} fails if one is added without it.
 * Spend is charged to the caller in {@link AiSpendContext}, which the rate-limit
 * filter sets for each paid request.
 *
 * <p><b>The per-caller daily limit is the one that normally matters.</b> An account
 * that spams uploads reaches its own limit and is paused alone, with a message
 * saying so; everyone else carries on. The app-wide daily and monthly limits are a
 * backstop for a bug or a crowd of throwaway accounts, and pause everyone.
 *
 * <p><b>What happens at a limit.</b> Features with a free fallback use it --
 * explanations fall back to the template, mechanic search to keyword matching.
 * Features without one -- reading a receipt, transcribing a voice note -- are
 * refused with {@link AiBudgetExceededException}, which reaches the owner as a
 * plain sentence pointing them at typing the record in. Nothing retries.
 *
 * <p><b>How far past a limit it can go.</b> The check and the call are not atomic:
 * calls already in flight when a limit is reached still finish and are paid for.
 * Each Vision page and each extraction attempt is checked separately, so the
 * overshoot is bounded by the single calls in flight at that moment.
 *
 * <p><b>Alerts.</b> An error-level log line, and a POST to
 * {@code TREVORA_AI_ALERT_WEBHOOK_URL} when one is set (a Discord or Slack incoming
 * webhook): when the day or month crosses 50%, 80% and 100% of the app-wide limit;
 * when one hour spends a quarter of a day's limit, which is the shape of a stuck
 * loop; and when a single caller reaches their own daily limit, which is the shape
 * of abuse. Each fires once per period per instance.
 *
 * <p>Days are UTC, the same calendar the provider dashboards bill on.
 */
@Component
public class AiSpendGuard {
    private static final Logger log = LoggerFactory.getLogger(AiSpendGuard.class);

    /** Assumed when a chat response carries no usage block, so a gap in reporting never reads as free. */
    static final long FALLBACK_INPUT_TOKENS = 12_000;
    static final long FALLBACK_OUTPUT_TOKENS = 4_000;
    /**
     * Assumed audio density when a transcription does not report its length: opus
     * at 16 kbps. That low a bitrate turns a file size into more minutes, not
     * fewer, so the estimate errs towards the expensive side.
     */
    static final long ASSUMED_AUDIO_BYTES_PER_SECOND = 2_000;

    private static final int[] ALERT_PERCENTS = {50, 80, 100};

    private final AiSpendProperties properties;
    private final AiSpendLedger ledger;
    private final Clock clock;
    private final Consumer<String> alertSink;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Set<String> firedAlerts = ConcurrentHashMap.newKeySet();
    private final Deque<long[]> lastHour = new ArrayDeque<>();
    private volatile HttpClient webhookClient;

    @Autowired
    public AiSpendGuard(
            AiSpendProperties properties,
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager
    ) {
        this(properties, new AiSpendLedger(jdbcTemplate, transactionManager), Clock.systemUTC(), null);
    }

    AiSpendGuard(AiSpendProperties properties, AiSpendLedger ledger, Clock clock, Consumer<String> alertSink) {
        this.properties = properties;
        this.ledger = ledger;
        this.clock = clock;
        this.alertSink = alertSink != null ? alertSink : this::raiseAlert;
    }

    /**
     * A guard that never refuses and never alerts, for code built outside Spring --
     * unit tests and the golden-set harness. Production is wired through the
     * {@code @Autowired} constructor of every paid caller.
     */
    public static AiSpendGuard unlimited() {
        return new AiSpendGuard(
                AiSpendProperties.disabled(), new AiSpendLedger(null, null), Clock.systemUTC(), message -> { });
    }

    enum Limit { NONE, DAILY, MONTHLY, CALLER_DAILY }

    /** Whether a paid call may go ahead for the current caller. For callers with a free fallback. */
    public boolean canSpend() {
        return limitReached() == Limit.NONE;
    }

    /** Refuses the call when a limit is reached. For callers with no free fallback. */
    public void requireBudget(String feature) {
        Limit limit = limitReached();
        if (limit == Limit.NONE) {
            return;
        }
        log.warn("Refused a paid AI call for {} ({}): {} limit reached", feature, AiSpendContext.current(), limit);
        throw new AiBudgetExceededException(switch (limit) {
            case CALLER_DAILY -> "You've reached today's AI limit for your account, so AI reading is paused for you "
                    + "until tomorrow. You can still add this record by typing it in.";
            case DAILY -> "Trevora's AI features are paused until tomorrow because today's AI spending limit has "
                    + "been reached. You can still add this record by typing it in.";
            default -> "Trevora's AI features are paused for the rest of the month because this month's AI spending "
                    + "limit has been reached. You can still add this record by typing it in.";
        });
    }

    Limit limitReached() {
        if (!properties.isEnabled()) {
            return Limit.NONE;
        }
        LocalDate today = today();
        if (ledger.spentMicros(today, today) >= properties.dailyLimitMicros()) {
            return Limit.DAILY;
        }
        if (ledger.spentMicros(today.withDayOfMonth(1), today) >= properties.monthlyLimitMicros()) {
            return Limit.MONTHLY;
        }
        String spender = AiSpendContext.current();
        long perCaller = properties.perUserDailyLimitMicros();
        if (perCaller > 0 && !AiSpendContext.UNATTRIBUTED.equals(spender)
                && ledger.spentMicrosBy(spender, today, today) >= perCaller) {
            return Limit.CALLER_DAILY;
        }
        return Limit.NONE;
    }

    /** Records a chat completion from the {@code usage} block of its response body. */
    public void recordChatResponse(String feature, String responseBody) {
        long input = FALLBACK_INPUT_TOKENS;
        long output = FALLBACK_OUTPUT_TOKENS;
        try {
            JsonNode usage = objectMapper.readTree(responseBody == null ? "" : responseBody).path("usage");
            if (usage.hasNonNull("prompt_tokens") || usage.hasNonNull("completion_tokens")) {
                input = usage.path("prompt_tokens").asLong(0);
                output = usage.path("completion_tokens").asLong(0);
            }
        } catch (Exception unreadable) {
            // The call happened and was paid for; the fallback stands in for what it used.
        }
        recordChat(feature, input, output);
    }

    public void recordChat(String feature, long inputTokens, long outputTokens) {
        long cost = perToken(properties.chatInputPerMillionUsd(), inputTokens)
                + perToken(properties.chatOutputPerMillionUsd(), outputTokens);
        record(feature, inputTokens, outputTokens, 0, cost);
    }

    public void recordVisionPages(String feature, int pages) {
        long cost = properties.visionPerThousandUsd()
                .multiply(BigDecimal.valueOf(pages))
                .multiply(BigDecimal.valueOf(1_000))
                .setScale(0, RoundingMode.CEILING)
                .longValue();
        record(feature, 0, 0, pages, cost);
    }

    /**
     * Records a transcription, from the reported length when the response has one
     * and from the file size otherwise (see {@link #ASSUMED_AUDIO_BYTES_PER_SECOND}).
     */
    public void recordTranscription(String feature, long audioBytes, String responseBody) {
        double seconds = -1;
        try {
            JsonNode usage = objectMapper.readTree(responseBody == null ? "" : responseBody).path("usage");
            if (usage.hasNonNull("seconds")) {
                seconds = usage.path("seconds").asDouble(-1);
            }
        } catch (Exception unreadable) {
            // Estimated from the file size below.
        }
        if (seconds < 0) {
            seconds = Math.max(1L, audioBytes) / (double) ASSUMED_AUDIO_BYTES_PER_SECOND;
        }
        long cost = properties.transcriptionPerMinuteUsd()
                .multiply(BigDecimal.valueOf(seconds / 60.0))
                .multiply(BigDecimal.valueOf(1_000_000))
                .setScale(0, RoundingMode.CEILING)
                .longValue();
        record(feature, 0, 0, (long) Math.ceil(seconds), cost);
    }

    /** A price per million tokens is that many micro-dollars per token. */
    private static long perToken(BigDecimal usdPerMillion, long tokens) {
        return usdPerMillion.multiply(BigDecimal.valueOf(Math.max(0, tokens)))
                .setScale(0, RoundingMode.CEILING)
                .longValue();
    }

    private void record(String feature, long inputTokens, long outputTokens, long units, long costMicros) {
        String spender = AiSpendContext.current();
        try {
            ledger.add(today(), feature, spender, 1, inputTokens, outputTokens, units, costMicros);
            checkAlerts(spender, costMicros);
        } catch (RuntimeException failure) {
            // Recording must never fail the request that was just paid for.
            log.error("Could not record AI spend for {}: {}", feature, failure.toString());
        }
    }

    private void checkAlerts(String spender, long justSpentMicros) {
        LocalDate today = today();
        long daily = properties.dailyLimitMicros();
        long monthly = properties.monthlyLimitMicros();
        long perCaller = properties.perUserDailyLimitMicros();

        if (daily > 0) {
            long spentToday = ledger.spentMicros(today, today);
            for (int percent : ALERT_PERCENTS) {
                if (spentToday * 100 >= daily * percent) {
                    fire("day:" + today + ":" + percent, String.format(Locale.ROOT,
                            "Estimated AI spend today (%s UTC) is %s, %d%% of the %s app-wide daily limit.%s",
                            today, usd(spentToday), percent, usd(daily),
                            percent >= 100 ? " Paid AI features are paused for everyone until the day turns over." : ""));
                }
            }
        }

        if (monthly > 0) {
            long spentThisMonth = ledger.spentMicros(today.withDayOfMonth(1), today);
            YearMonth month = YearMonth.from(today);
            for (int percent : ALERT_PERCENTS) {
                if (spentThisMonth * 100 >= monthly * percent) {
                    fire("month:" + month + ":" + percent, String.format(Locale.ROOT,
                            "Estimated AI spend for %s is %s, %d%% of the %s monthly limit.%s",
                            month, usd(spentThisMonth), percent, usd(monthly),
                            percent >= 100 ? " Paid AI features are paused for everyone until next month." : ""));
                }
            }
        }

        if (perCaller > 0 && !AiSpendContext.UNATTRIBUTED.equals(spender)
                && ledger.spentMicrosBy(spender, today, today) >= perCaller) {
            fire("caller:" + today + ":" + spender, String.format(Locale.ROOT,
                    "One caller (%s) reached its %s daily AI limit and is paused until tomorrow. Everyone else is "
                            + "unaffected. If the same caller does this every day, look at it for abuse.",
                    spender, usd(perCaller)));
        }

        if (daily > 0) {
            long now = clock.millis();
            long hourMillis = Duration.ofHours(1).toMillis();
            long spentLastHour;
            synchronized (lastHour) {
                lastHour.addLast(new long[] {now, justSpentMicros});
                while (!lastHour.isEmpty() && lastHour.peekFirst()[0] < now - hourMillis) {
                    lastHour.removeFirst();
                }
                spentLastHour = lastHour.stream().mapToLong(entry -> entry[1]).sum();
            }
            if (spentLastHour * 4 >= daily) {
                fire("hour:" + (now / hourMillis), String.format(Locale.ROOT,
                        "Unusual AI spend: %s in the last hour on this instance, a quarter or more of the %s "
                                + "app-wide daily limit. Check for a stuck loop or abuse.",
                        usd(spentLastHour), usd(daily)));
            }
        }
    }

    /**
     * Raises an alert through the same channel as the spend alerts -- the log,
     * and the webhook when one is set. For other protections that need a person
     * to look, such as an account being suspended for spam.
     */
    public void alert(String message) {
        try {
            alertSink.accept(message);
        } catch (RuntimeException failure) {
            log.error("Could not raise alert: {}", failure.toString());
        }
    }

    private void fire(String key, String message) {
        if (firedAlerts.size() > 1_000) {
            firedAlerts.clear();
        }
        if (firedAlerts.add(key)) {
            alertSink.accept(message);
        }
    }

    private void raiseAlert(String message) {
        log.error("AI SPEND ALERT: {}", message);
        String url = properties.alertWebhookUrl();
        if (url.isBlank()) {
            return;
        }
        try {
            HttpClient client = webhookClient;
            if (client == null) {
                client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
                webhookClient = client;
            }
            String text = objectMapper.writeValueAsString("Trevora: " + message);
            // `content` is what Discord reads and `text` is what Slack reads; each ignores the other.
            String payload = "{\"content\":" + text + ",\"text\":" + text + "}";
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();
            client.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                    .whenComplete((response, failure) -> {
                        if (failure != null) {
                            log.warn("AI spend alert webhook failed: {}", failure.toString());
                        } else if (response.statusCode() >= 300) {
                            log.warn("AI spend alert webhook answered HTTP {}", response.statusCode());
                        }
                    });
        } catch (Exception failure) {
            log.warn("AI spend alert webhook could not be sent: {}", failure.toString());
        }
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    private static String usd(long micros) {
        return String.format(Locale.ROOT, "$%.2f", micros / 1_000_000.0);
    }
}
