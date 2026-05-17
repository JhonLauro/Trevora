package com.trevora.api.dto;

import com.trevora.api.model.QRAccessRequest;
import java.time.Instant;
import java.util.UUID;

public record QRAccessRequestResponse(
        UUID qrAccessRequestId,
        UUID vehicleProfileId,
        UUID ownerId,
        String accessToken,
        String accessUrl,
        String status,
        Instant expiresAt,
        Instant createdAt,
        Instant usedAt,
        long confirmedRecordCount
) {
    public static QRAccessRequestResponse from(QRAccessRequest request, String accessUrl, long confirmedRecordCount) {
        return new QRAccessRequestResponse(
                request.getQrAccessRequestId(),
                request.getVehicleId(),
                request.getOwnerId(),
                request.getAccessToken(),
                accessUrl,
                request.getStatus(),
                request.getExpiresAt(),
                request.getCreatedAt(),
                request.getUsedAt(),
                confirmedRecordCount
        );
    }
}
