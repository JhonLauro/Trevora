package com.trevora.api.dto;

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
