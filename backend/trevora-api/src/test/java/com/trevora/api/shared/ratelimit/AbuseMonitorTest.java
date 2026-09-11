package com.trevora.api.shared.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.trevora.api.features.auth.AccountStandingService;
import com.trevora.api.shared.exception.AccountSuspendedException;
import com.trevora.api.shared.ratelimit.AbuseMonitor.Outcome;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * An account spamming the receipt reader is warned, warned for the last time,
 * then suspended -- and an account that merely hits a limit once or twice is not.
 */
class AbuseMonitorTest {

    private final MutableClock clock = new MutableClock();
    private final AccountStandingService standing = AccountStandingService.inMemory(clock);
    private final List<String> alerts = new ArrayList<>();
    private final UUID owner = UUID.randomUUID();

    /** 5 refusals in 10 minutes is a strike; strikes 30 minutes apart; remembered 30 days. */
    private AbuseMonitor monitor() {
        return new AbuseMonitor(true, 5, Duration.ofMinutes(10), Duration.ofMinutes(30), Duration.ofDays(30),
                standing, alerts::add, clock);
    }

    private Outcome burst(AbuseMonitor monitor, UUID account, int refusals) {
        Outcome last = Outcome.NONE;
        for (int refusal = 0; refusal < refusals; refusal++) {
            last = monitor.recordRefusal(account, "receipt");
        }
        return last;
    }

    private int strikes(UUID account) {
        return standing.strikesSince(account, Instant.EPOCH).size();
    }

    @Test
    @DisplayName("hitting a limit a few times is not a strike")
    void aFewRefusalsAreNothing() {
        assertThat(burst(monitor(), owner, 4)).isEqualTo(Outcome.NONE);
        assertThat(strikes(owner)).isZero();
        assertThat(alerts).isEmpty();
    }

    @Test
    @DisplayName("refusals spread out over time are not a strike")
    void spreadOutRefusalsAreNothing() {
        AbuseMonitor monitor = monitor();
        burst(monitor, owner, 4);
        clock.advance(Duration.ofMinutes(11));

        assertThat(burst(monitor, owner, 4)).isEqualTo(Outcome.NONE);
        assertThat(strikes(owner)).isZero();
    }

    @Test
    @DisplayName("warning, then final warning, then suspension")
    void escalates() {
        AbuseMonitor monitor = monitor();

        assertThat(burst(monitor, owner, 5)).isEqualTo(Outcome.WARNING);
        clock.advance(Duration.ofMinutes(31));
        assertThat(burst(monitor, owner, 5)).isEqualTo(Outcome.FINAL_WARNING);
        clock.advance(Duration.ofMinutes(31));
        assertThat(burst(monitor, owner, 5)).isEqualTo(Outcome.SUSPENDED);

        assertThat(standing.suspension(owner)).isPresent();
        assertThatThrownBy(() -> standing.requireNotSuspended(owner))
                .isInstanceOf(AccountSuspendedException.class)
                .hasMessageContaining("suspended")
                .hasMessageContaining("automated receipt uploads");
        assertThat(alerts).hasSize(3);
        assertThat(alerts.get(2)).contains("SUSPENDED").contains(owner.toString());
    }

    @Test
    @DisplayName("one long burst is one strike, not three in a row")
    void oneBurstIsOneStrike() {
        AbuseMonitor monitor = monitor();

        assertThat(burst(monitor, owner, 5)).isEqualTo(Outcome.WARNING);
        assertThat(burst(monitor, owner, 50)).isEqualTo(Outcome.WARNING);

        assertThat(strikes(owner)).isEqualTo(1);
        assertThat(standing.suspension(owner)).isEmpty();
    }

    @Test
    @DisplayName("strikes older than the memory period are forgotten")
    void oldStrikesAreForgotten() {
        AbuseMonitor monitor = monitor();
        burst(monitor, owner, 5);
        clock.advance(Duration.ofDays(31));

        assertThat(burst(monitor, owner, 5)).isEqualTo(Outcome.WARNING);
    }

    @Test
    @DisplayName("one account's strikes do nothing to another account")
    void accountsAreSeparate() {
        AbuseMonitor monitor = monitor();
        UUID someoneElse = UUID.randomUUID();
        burst(monitor, owner, 5);

        assertThat(burst(monitor, someoneElse, 4)).isEqualTo(Outcome.NONE);
        assertThat(strikes(someoneElse)).isZero();
    }

    @Test
    @DisplayName("disabled, or with no signed-in account, nothing is counted")
    void disabledOrAnonymousDoesNothing() {
        assertThat(burst(AbuseMonitor.disabled(), owner, 100)).isEqualTo(Outcome.NONE);
        assertThat(burst(monitor(), null, 100)).isEqualTo(Outcome.NONE);
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-09-12T10:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
