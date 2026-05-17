package com.trevora.api.dto;

public record PublicMechanicRequestStatusResponse(
        PublicQRAccessRequestResponse qrRequest,
        MechanicAccessRequestResponse mechanicRequest,
        MechanicAccessSessionResponse session
) {
}
