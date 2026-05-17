package com.trevora.api.dto;

public record AccessDecisionResponse(
        MechanicAccessRequestResponse request,
        MechanicAccessSessionResponse session
) {
}
