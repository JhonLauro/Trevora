package com.trevora.api.shared.aibudget;

import java.time.LocalDate;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Where AI spend is written down: {@code public.ai_usage_daily}, from migration 025.
 *
 * <p><b>Every read and write runs in its own transaction.</b> The calls it
 * records happen inside other features' transactions, and two things would go
 * wrong otherwise. A write sharing the caller's transaction is rolled back with
 * it -- a receipt upload that fails after its OpenAI call would un-record money
 * that was really spent. And a failed statement inside a Postgres transaction
 * aborts that whole transaction, so a missing table would have broken the
 * feature around it rather than just this ledger.
 *
 * <p><b>It never stops the app.</b> If the table is missing or the database
 * refuses, it logs the problem at most once a minute and falls back to what
 * this process has spent since it started, so the limits still hold for this
 * instance. When the database does answer, the larger of the two figures wins:
 * a write that failed is still counted here even though the table missed it.
 *
 * <p>Built with no database (both arguments null) it keeps everything in memory,
 * which is what tests use.
 */
public class AiSpendLedger {
    private static final Logger log = LoggerFactory.getLogger(AiSpendLedger.class);
    private static final long FAILURE_LOG_INTERVAL_MILLIS = 60_000;

    private static final String UPSERT = """
            insert into public.ai_usage_daily
                (usage_date, feature, calls, input_tokens, output_tokens, units, cost_micros, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, now())
            on conflict (usage_date, feature) do update set
                calls = ai_usage_daily.calls + excluded.calls,
                input_tokens = ai_usage_daily.input_tokens + excluded.input_tokens,
                output_tokens = ai_usage_daily.output_tokens + excluded.output_tokens,
                units = ai_usage_daily.units + excluded.units,
                cost_micros = ai_usage_daily.cost_micros + excluded.cost_micros,
                updated_at = now()
            """;

    private static final String SUM = """
            select coalesce(sum(cost_micros), 0)
            from public.ai_usage_daily
            where usage_date between ? and ?
            """;

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate ownTransaction;
    private final Map<LocalDate, AtomicLong> spentHere = new ConcurrentHashMap<>();
    private volatile long lastFailureLoggedAt;

    public AiSpendLedger(JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager) {
        this.jdbcTemplate = jdbcTemplate;
        if (jdbcTemplate == null || transactionManager == null) {
            this.ownTransaction = null;
        } else {
            TransactionTemplate template = new TransactionTemplate(transactionManager);
            template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            this.ownTransaction = template;
        }
    }

    public void add(
            LocalDate day, String feature, long calls, long inputTokens, long outputTokens, long units, long costMicros) {
        spentHere.computeIfAbsent(day, ignored -> new AtomicLong()).addAndGet(costMicros);
        spentHere.keySet().removeIf(recorded -> recorded.isBefore(day.minusDays(40)));
        if (jdbcTemplate == null) {
            return;
        }
        try {
            Runnable write = () -> jdbcTemplate.update(
                    UPSERT, day, feature, calls, inputTokens, outputTokens, units, costMicros);
            if (ownTransaction == null) {
                write.run();
            } else {
                ownTransaction.executeWithoutResult(status -> write.run());
            }
        } catch (RuntimeException failure) {
            noteFailure("record", failure);
        }
    }

    /** Estimated spend, in micro-dollars, across the inclusive range of UTC days. */
    public long spentMicros(LocalDate from, LocalDate toInclusive) {
        long here = spentHere.entrySet().stream()
                .filter(entry -> !entry.getKey().isBefore(from) && !entry.getKey().isAfter(toInclusive))
                .mapToLong(entry -> entry.getValue().get())
                .sum();
        if (jdbcTemplate == null) {
            return here;
        }
        try {
            Long stored = ownTransaction == null
                    ? jdbcTemplate.queryForObject(SUM, Long.class, from, toInclusive)
                    : ownTransaction.execute(status -> jdbcTemplate.queryForObject(SUM, Long.class, from, toInclusive));
            return Math.max(stored == null ? 0 : stored, here);
        } catch (RuntimeException failure) {
            noteFailure("read", failure);
            return here;
        }
    }

    private void noteFailure(String action, RuntimeException failure) {
        long now = System.currentTimeMillis();
        if (now - lastFailureLoggedAt < FAILURE_LOG_INTERVAL_MILLIS) {
            return;
        }
        lastFailureLoggedAt = now;
        log.error("AI spend ledger could not {} ai_usage_daily ({}). Limits are being enforced from this "
                + "instance's own count until it can -- has migration 025 been applied?", action, failure.toString());
    }
}
