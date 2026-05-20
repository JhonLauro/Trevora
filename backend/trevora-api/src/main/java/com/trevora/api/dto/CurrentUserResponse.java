package com.trevora.api.dto;

import java.util.UUID;

public record CurrentUserResponse(
        UUID userId,
        String firstName,
        String lastName,
        String fullName,
        String email,
        String role
) {
}
