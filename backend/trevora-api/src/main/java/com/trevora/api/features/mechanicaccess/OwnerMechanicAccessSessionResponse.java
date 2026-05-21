package com.trevora.api.features.mechanicaccess;

import com.trevora.api.features.mechanicaccess.MechanicAccessSession;
import com.trevora.api.features.sharing.MechanicAccessRequest;
import java.time.Instant;
import java.util.UUID;

public record OwnerMechanicAccessSessionResponse(
        UUID mechanicAccessSessionId,
        UUID mechanicAccessRequestId,
        UUID vehicleProfileId,
        String vehicleLabel,
        String mechanicName,
        String shopName,
        String contactInfo,
        String permission,
        String status,
        Instant approvedAt,
        Instant expiresAt
) {
    public static OwnerMechanicAccessSessionResponse from(
            MechanicAccessSession session,
            String vehicleLabel,
            MechanicAccessRequest request
    ) {
        return new OwnerMechanicAccessSessionResponse(
                session.getMechanicAccessSessionId(),
                session.getMechanicAccessRequestId(),
                session.getVehicleId(),
                vehicleLabel,
                request == null ? null : request.getMechanicName(),
                request == null ? null : request.getShopName(),
                request == null ? null : request.getContactInfo(),
                session.getPermission(),
                session.getStatus(),
                session.getApprovedAt(),
                session.getExpiresAt()
        );
    }
}
