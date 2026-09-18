package com.trevora.api.features.serviceinput;

import java.time.LocalDate;
import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The quality gate's health number: how many receipt pages it looked at each UTC
 * day, and what it concluded. Written to {@code public.receipt_quality_daily}
 * (migration 027); the reject-rate query is in that migration's header.
 *
 * <p>Built the way {@code AiSpendLedger} is, for the same two reasons. <b>Every
 * write is its own transaction</b>: the gate runs inside the receipt upload's
 * transaction, and a stopped upload rolls that back, which would un-record
 * exactly the pages this table exists to count. <b>It never stops the app</b>: a
 * missing table or a refusing database is logged at most once a minute and
 * otherwise ignored. A counter is not worth failing an upload over.
 *
 * <p>No JPA entity, deliberately. Hibernate validates the schema at startup, so
 * an entity for this table would stop the API booting anywhere migration 027 has
 * not been applied yet.
 */
@Component
public class ReceiptQualityStats {
    private static final Logger log = LoggerFactory.getLogger(ReceiptQualityStats.class);
    private static final long FAILURE_LOG_INTERVAL_MILLIS = 60_000;

    private static final String UPSERT = """
            insert into public.receipt_quality_daily (check_date, outcome, read_anyway, pages, updated_at)
            values (?, ?, ?, 1, now())
            on conflict (check_date, outcome, read_anyway) do update set
                pages = receipt_quality_daily.pages + 1,
                updated_at = now()
            """;

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate ownTransaction;
    private volatile long lastFailureLoggedAt;

    public ReceiptQualityStats(JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager) {
        this.jdbcTemplate = jdbcTemplate;
        if (jdbcTemplate == null || transactionManager == null) {
            this.ownTransaction = null;
        } else {
            TransactionTemplate template = new TransactionTemplate(transactionManager);
            template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            this.ownTransaction = template;
        }
    }

    /** Records nothing -- for tests and the golden-set harness. */
    public static ReceiptQualityStats disabled() {
        return new ReceiptQualityStats(null, null);
    }

    /**
     * Counts one page.
     *
     * @param readAnyway whether the owner had been warned about this upload and
     *                   chose to read it anyway; recorded only for pages with a problem
     */
    public void record(ReceiptQualityReport report, boolean readAnyway) {
        if (jdbcTemplate == null || report == null) {
            return;
        }
        // A warned page passed, but is kept apart from a clean pass so the
        // warning lines can be tuned from real uploads too.
        String outcome = !report.checked()
                ? "UNCHECKED"
                : !report.passed() ? report.primaryIssue().name()
                : report.primaryWarning() != null ? "WARN_" + report.primaryWarning().name()
                : "PASSED";
        write(outcome, readAnyway && report.checked() && !report.passed());
    }

    /**
     * Counts one page that OCR found no receipt on ({@code NO_TEXT} or
     * {@code NO_DOCUMENT}), after the pixels had passed.
     */
    public void recordText(ReceiptQualityIssue issue, boolean readAnyway) {
        if (jdbcTemplate == null || issue == null) {
            return;
        }
        write(issue.name(), readAnyway);
    }

    private void write(String outcome, boolean overridden) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        try {
            Runnable write = () -> jdbcTemplate.update(UPSERT, today, outcome, overridden);
            if (ownTransaction == null) {
                write.run();
            } else {
                ownTransaction.executeWithoutResult(status -> write.run());
            }
        } catch (RuntimeException failure) {
            long now = System.currentTimeMillis();
            if (now - lastFailureLoggedAt >= FAILURE_LOG_INTERVAL_MILLIS) {
                lastFailureLoggedAt = now;
                log.warn("Could not record a receipt quality check (is migration 027 applied?): {}",
                        failure.getMessage());
            }
        }
    }
}
