package com.trevora.api.features.sharing;

import java.time.Duration;

/**
 * How long sharing lasts, and the only place that says so.
 *
 * <p>Two clocks, deliberately separate. A share link is how a mechanic asks:
 * once it lapses, or is overwritten by a newer one, the code stops opening a
 * request. A session is the access an approved mechanic actually has, and it
 * runs from approval on its own -- nothing that happens to the link shortens it.
 *
 * <p>These were constants in two services, with the numbers copied by hand
 * into the share screen, the Terms, the Privacy page and the welcome
 * walkthrough, where they drifted. Screens now read them from
 * {@code GET /api/qr-access/policy}; change a value here and every screen that
 * states it follows.
 *
 * <p>Whole hours, because that is how every screen states them. A value that
 * is not a whole number of hours would be rounded down wherever it is shown --
 * {@code SharingPolicyTest} fails if one is set.
 */
public final class SharingPolicy {
    /** How long a generated share link can be scanned. */
    public static final Duration LINK_LIFETIME = Duration.ofHours(4);

    /** How long an approved mechanic's read-only access lasts. */
    public static final Duration SESSION_LIFETIME = Duration.ofHours(4);

    private SharingPolicy() {
    }
}
