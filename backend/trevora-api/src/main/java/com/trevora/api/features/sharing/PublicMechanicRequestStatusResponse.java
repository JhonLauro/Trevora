package com.trevora.api.features.sharing;

public record PublicMechanicRequestStatusResponse(
        PublicQRAccessRequestResponse qrRequest,
        MechanicAccessRequestResponse mechanicRequest,
        MechanicAccessSessionResponse session
) {
}
