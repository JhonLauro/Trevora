package com.trevora.api.features.mechanicaccess;

import java.time.Instant;
import java.util.UUID;

public record MechanicSharedRecordDetailResponse(
        UUID sessionId,
        UUID vehicleId,
        String vehicleLabel,
        String permission,
        Instant expiresAt,
        MechanicSharedServiceRecordResponse record
) {
}
