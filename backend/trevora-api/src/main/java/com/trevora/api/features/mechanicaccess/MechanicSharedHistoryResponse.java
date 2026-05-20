package com.trevora.api.features.mechanicaccess;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MechanicSharedHistoryResponse(
        UUID sessionId,
        UUID vehicleId,
        String vehicleLabel,
        String permission,
        String status,
        Instant approvedAt,
        Instant expiresAt,
        int totalRecords,
        List<MechanicSharedServiceRecordResponse> records
) {
}
