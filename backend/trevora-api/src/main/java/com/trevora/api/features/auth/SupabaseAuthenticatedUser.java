package com.trevora.api.features.auth;

import java.util.UUID;

public record SupabaseAuthenticatedUser(
        UUID userId,
        String email,
        String firstName,
        String lastName,
        UserRole role
) {
}
