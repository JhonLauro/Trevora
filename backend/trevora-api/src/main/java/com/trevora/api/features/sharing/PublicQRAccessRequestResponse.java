package com.trevora.api.features.sharing;

import java.time.Instant;
import java.util.UUID;

/**
 * What an unapproved stranger holding a share link is allowed to see.
 *
 * <p>The plate used to be a field here. This record is returned by
 * {@code GET /api/qr-access/requests/{token}}, which takes no credential at
 * all — so the plate of a named vehicle was readable by anyone who came into
 * possession of the link, before the owner had approved anything and whether
 * or not they ever did. A plate is personal data; consent that arrives after
 * disclosure is not consent.
 *
 * <p>The label stays: it is the owner's own nickname or the make and model,
 * which is enough for a mechanic to confirm they scanned the right code. The
 * plate now travels on {@code MechanicSharedHistoryResponse}, behind an
 * approved, expiring session.
 */
public record PublicQRAccessRequestResponse(
        UUID qrAccessRequestId,
        UUID vehicleProfileId,
        String vehicleLabel,
        String status,
        Instant expiresAt,
        long confirmedRecordCount
) {
}
