package com.trevora.api.features.sharing;

public record AccessDecisionResponse(
        MechanicAccessRequestResponse request,
        MechanicAccessSessionResponse session
) {
}
