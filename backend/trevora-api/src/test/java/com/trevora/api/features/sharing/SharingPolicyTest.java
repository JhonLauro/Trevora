package com.trevora.api.features.sharing;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The lifetimes the screens state are the lifetimes the services enforce.
 *
 * <p>Deliberately does not pin the values themselves. They are defined once,
 * in {@link SharingPolicy}; a test repeating "3 hours" would be one more copy
 * to forget when the number changes. What can go wrong is the served figure
 * disagreeing with the enforced one -- a lifetime that is not a whole number of
 * hours, rounded down on its way to the screen -- and that is what this checks.
 */
class SharingPolicyTest {

    @Test
    @DisplayName("the hours served to screens are exactly the lifetimes the services use")
    void servedHoursMatchEnforcedLifetimes() {
        SharingPolicyResponse served = SharingPolicyResponse.current();

        assertThat(Duration.ofHours(served.linkHours())).isEqualTo(SharingPolicy.LINK_LIFETIME);
        assertThat(Duration.ofHours(served.sessionHours())).isEqualTo(SharingPolicy.SESSION_LIFETIME);
    }
}
