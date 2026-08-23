package com.trevora.api.features.mechanicaccess;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MechanicSharedHistoryResponse(
        UUID sessionId,
        UUID vehicleId,
        String vehicleLabel,
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
