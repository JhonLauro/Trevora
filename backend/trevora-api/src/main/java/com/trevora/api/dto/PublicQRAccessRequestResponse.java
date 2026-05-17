package com.trevora.api.dto;

import java.time.Instant;
import java.util.UUID;

public record PublicQRAccessRequestResponse(
        UUID qrAccessRequestId,
        UUID vehicleProfileId,
        String vehicleLabel,
        String plateNumber,
        String status,
        Instant expiresAt,
        long confirmedRecordCount
) {
}
