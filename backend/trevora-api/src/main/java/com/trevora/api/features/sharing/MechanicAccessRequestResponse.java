package com.trevora.api.features.sharing;

import com.trevora.api.features.sharing.MechanicAccessRequest;
import java.time.Instant;
import java.util.UUID;

/**
 * A mechanic's request to see one vehicle's history.
 *
 * <p>Carried no plate since the leak was closed. This record is returned to
 * the unauthenticated caller twice before any approval exists — once from
 * {@code POST .../mechanic-request} and again from every poll of
 * {@code GET .../mechanic-request/status} — so masking the plate on
 * {@code PublicQRAccessRequestResponse} alone would have left it flowing out
 * of the same endpoint by a second route. Nothing rendered it, which is why it
 * is gone rather than gated.
 */
public record MechanicAccessRequestResponse(
        UUID mechanicAccessRequestId,
        UUID qrAccessRequestId,
        UUID vehicleProfileId,
        String vehicleLabel,
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
            String vehicleLabel
    ) {
        return new MechanicAccessRequestResponse(
                request.getMechanicAccessRequestId(),
                request.getQrAccessRequestId(),
                request.getVehicleId(),
                vehicleLabel,
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
