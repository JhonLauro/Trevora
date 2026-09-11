package com.trevora.api.features.auth;

import com.trevora.api.shared.exception.AccountSuspendedException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Whether an account is in good standing: its strikes for abusing a paid
 * feature, and whether it is suspended.
 *
 * <p>Backed by {@code users.suspended_at}, {@code users.suspension_reason} and
 * {@code account_strikes} (migration 025). The columns are read with SQL rather
 * than mapped on {@link User}, so a backend deployed before the migration still
 * starts.
 *
 * <p><b>Checked on every signed-in request</b> (by {@link SupabaseAuthService}),
 * so the answer is cached for 30 seconds per account. A suspension made here takes
 * effect at once; one set or lifted by hand in the database takes up to 30 seconds.
 *
 * <p><b>It fails open.</b> Every query runs in its own transaction, like the AI
 * spend ledger, and if the database cannot answer the account is treated as not
 * suspended and the problem is logged at most once a minute. Locking every owner
 * out because a table is missing would be worse than a spammer getting a few more
 * minutes. What this instance decided itself is still remembered in memory.
 *
 * <p>Built with no database it keeps everything in memory, which is what tests use.
 */
@Service
public class AccountStandingService {
    private static final Logger log = LoggerFactory.getLogger(AccountStandingService.class);
    private static final Duration CACHE_TTL = Duration.ofSeconds(30);
    private static final long FAILURE_LOG_INTERVAL_MILLIS = 60_000;

    public record Suspension(Instant suspendedAt, String reason) {
    }

    /** One strike: level 1 a warning, 2 a final warning, 3 the one that suspended. */
    public record Strike(int level, Instant createdAt) {
    }

    private record CachedSuspension(Suspension suspension, long expiresAt) {
    }

    private static final String FIND_SUSPENSION = """
            select suspended_at, suspension_reason
            from public.users
            where user_id = ? and suspended_at is not null
            """;

    private static final String SUSPEND = """
            update public.users
            set suspended_at = now(), suspension_reason = ?
            where user_id = ? and suspended_at is null
            """;

    private static final String FIND_STRIKES = """
            select level, created_at
            from public.account_strikes
            where user_id = ? and created_at >= ?
            order by created_at desc
            """;

    private static final String ADD_STRIKE = """
            insert into public.account_strikes (user_id, feature, level, refused_requests)
            values (?, ?, ?, ?)
            """;

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate ownTransaction;
    private final Clock clock;
    private final Map<UUID, CachedSuspension> cache = new ConcurrentHashMap<>();
    private final Map<UUID, Suspension> suspendedHere = new ConcurrentHashMap<>();
    private final Map<UUID, List<Strike>> strikesHere = new ConcurrentHashMap<>();
    private volatile long lastFailureLoggedAt;

    @Autowired
    public AccountStandingService(JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager) {
        this(jdbcTemplate, transactionManager, Clock.systemUTC());
    }

    AccountStandingService(JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
        if (jdbcTemplate == null || transactionManager == null) {
            this.ownTransaction = null;
        } else {
            TransactionTemplate template = new TransactionTemplate(transactionManager);
            template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            this.ownTransaction = template;
        }
    }

    /** Standing kept in memory only, for code built outside Spring. */
    public static AccountStandingService inMemory(Clock clock) {
        return new AccountStandingService(null, null, clock);
    }

    public static AccountStandingService inMemory() {
        return inMemory(Clock.systemUTC());
    }

    /** What a suspended owner is told. */
    public static String messageFor(String reason) {
        String because = reason == null || reason.isBlank() ? "" : " Reason: " + reason.trim();
        return "Your Trevora account has been suspended." + because
                + " If you think this is a mistake, contact the Trevora team.";
    }

    public Optional<Suspension> suspension(UUID userId) {
        if (userId == null) {
            return Optional.empty();
        }
        if (ownTransaction == null) {
            return Optional.ofNullable(suspendedHere.get(userId));
        }
        long now = clock.millis();
        CachedSuspension cached = cache.get(userId);
        if (cached != null && cached.expiresAt() > now) {
            return Optional.ofNullable(cached.suspension());
        }
        try {
            List<Suspension> rows = ownTransaction.execute(status -> jdbcTemplate.query(
                    FIND_SUSPENSION,
                    (row, index) -> new Suspension(
                            row.getTimestamp("suspended_at").toInstant(), row.getString("suspension_reason")),
                    userId));
            Suspension found = rows == null || rows.isEmpty() ? null : rows.get(0);
            if (cache.size() > 10_000) {
                cache.clear();
            }
            cache.put(userId, new CachedSuspension(found, now + CACHE_TTL.toMillis()));
            return Optional.ofNullable(found);
        } catch (RuntimeException failure) {
            noteFailure("check the suspension of", failure);
            return Optional.ofNullable(suspendedHere.get(userId));
        }
    }

    /** Refuses a suspended account, with the reason. */
    public void requireNotSuspended(UUID userId) {
        Optional<Suspension> suspension = suspension(userId);
        if (suspension.isPresent()) {
            throw new AccountSuspendedException(messageFor(suspension.get().reason()));
        }
    }

    public void suspend(UUID userId, String reason) {
        Suspension suspension = new Suspension(clock.instant(), reason);
        suspendedHere.put(userId, suspension);
        cache.put(userId, new CachedSuspension(suspension, clock.millis() + CACHE_TTL.toMillis()));
        if (ownTransaction == null) {
            return;
        }
        try {
            ownTransaction.executeWithoutResult(status -> jdbcTemplate.update(SUSPEND, reason, userId));
        } catch (RuntimeException failure) {
            noteFailure("suspend", failure);
        }
    }

    /** The account's strikes since the given moment, newest first. */
    public List<Strike> strikesSince(UUID userId, Instant since) {
        if (ownTransaction != null) {
            try {
                List<Strike> rows = ownTransaction.execute(status -> jdbcTemplate.query(
                        FIND_STRIKES,
                        (row, index) -> new Strike(row.getInt("level"), row.getTimestamp("created_at").toInstant()),
                        userId, Timestamp.from(since)));
                return rows == null ? List.of() : rows;
            } catch (RuntimeException failure) {
                noteFailure("read the strikes of", failure);
            }
        }
        return strikesHere.getOrDefault(userId, List.of()).stream()
                .filter(strike -> !strike.createdAt().isBefore(since))
                .sorted(Comparator.comparing(Strike::createdAt).reversed())
                .toList();
    }

    public void addStrike(UUID userId, String feature, int level, int refusedRequests) {
        strikesHere.computeIfAbsent(userId, id -> new CopyOnWriteArrayList<>())
                .add(new Strike(level, clock.instant()));
        if (ownTransaction == null) {
            return;
        }
        try {
            ownTransaction.executeWithoutResult(status ->
                    jdbcTemplate.update(ADD_STRIKE, userId, feature, level, refusedRequests));
        } catch (RuntimeException failure) {
            noteFailure("record a strike against", failure);
        }
    }

    private void noteFailure(String action, RuntimeException failure) {
        long now = System.currentTimeMillis();
        if (now - lastFailureLoggedAt < FAILURE_LOG_INTERVAL_MILLIS) {
            return;
        }
        lastFailureLoggedAt = now;
        log.error("Could not {} an account ({}). Accounts are treated as in good standing until this works "
                + "-- has migration 025 been applied?", action, failure.toString());
    }
}
