package com.trevora.api.dto;

import com.trevora.api.model.MechanicAccessSession;
import java.time.Instant;
import java.util.UUID;

public record MechanicAccessSessionResponse(
        UUID mechanicAccessSessionId,
        UUID mechanicAccessRequestId,
        UUID vehicleProfileId,
        String vehicleLabel,
        String sessionToken,
        String permission,
        String status,
        Instant approvedAt,
        Instant expiresAt
) {
    public static MechanicAccessSessionResponse from(MechanicAccessSession session, String vehicleLabel) {
        return new MechanicAccessSessionResponse(
                session.getMechanicAccessSessionId(),
                session.getMechanicAccessRequestId(),
                session.getVehicleId(),
                vehicleLabel,
                session.getSessionToken(),
                session.getPermission(),
                session.getStatus(),
                session.getApprovedAt(),
                session.getExpiresAt()
        );
    }
}
