package com.trevora.api.features.sharing;

import com.trevora.api.features.sharing.QRAccessRequest;
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
                // The token travels only with the URL built from it: a link that is
                // no longer scannable gets neither. See QRAccessService#toOwnerResponse.
                accessUrl == null ? null : request.getAccessToken(),
                accessUrl,
                request.getStatus(),
                request.getExpiresAt(),
                request.getCreatedAt(),
                request.getUsedAt(),
                confirmedRecordCount
        );
    }
}
