package com.trevora.api.dto;

import com.trevora.api.enums.UserRole;
import java.util.UUID;

public record SupabaseAuthenticatedUser(
        UUID userId,
        String email,
        String firstName,
        String lastName,
        UserRole role
) {
}
