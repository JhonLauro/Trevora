package com.trevora.api.features.mechanicaccess;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MechanicSharedHistoryResponse(
        UUID sessionId,
        UUID vehicleId,
        String vehicleLabel,
        // The one place a plate is shown to a mechanic. It used to be handed to
        // anyone holding the share link, before approval; here it is behind an
        // owner-approved session that expires, which is the only point at which
        // "helps a mechanic confirm the right vehicle" is worth the disclosure.
        // Null whenever the owner has not recorded one — it is optional, and a
        // blank is a legitimate answer rather than a gap to fill.
        String plateNumber,
        // The parts map needs the silhouette. Without it the mechanic view drew
        // a sedan for every vehicle, including motorcycles.
        String vehicleBodyType,
        String permission,
        String status,
        Instant approvedAt,
        Instant expiresAt,
        int totalRecords,
        List<MechanicSharedServiceRecordResponse> records
) {
}
