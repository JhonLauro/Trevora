package com.trevora.api.features.sharing;

public record CreateMechanicAccessRequest(
        String mechanicName,
        String shopName,
        String contactInfo,
        String reason
) {
}
