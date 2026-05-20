package com.trevora.api.features.sharing;

import com.trevora.api.features.sharing.MechanicAccessRequest;
import java.time.Instant;
import java.util.UUID;

public record MechanicAccessRequestResponse(
        UUID mechanicAccessRequestId,
        UUID qrAccessRequestId,
        UUID vehicleProfileId,
        String vehicleLabel,
        String plateNumber,
        String mechanicName,
        String shopName,
        String contactInfo,
        String reason,
        String status,
        Instant requestedAt,
        Instant decidedAt
) {
    public static MechanicAccessRequestResponse from(
            MechanicAccessRequest request,
            String vehicleLabel,
            String plateNumber
    ) {
        return new MechanicAccessRequestResponse(
                request.getMechanicAccessRequestId(),
                request.getQrAccessRequestId(),
                request.getVehicleId(),
                vehicleLabel,
                plateNumber,
                request.getMechanicName(),
                request.getShopName(),
                request.getContactInfo(),
                request.getReason(),
                request.getStatus(),
                request.getRequestedAt(),
                request.getDecidedAt()
        );
    }
}
