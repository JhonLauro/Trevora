package com.trevora.api.dto;

public record CreateMechanicAccessRequest(
        String mechanicName,
        String shopName,
        String contactInfo,
        String reason
) {
}
