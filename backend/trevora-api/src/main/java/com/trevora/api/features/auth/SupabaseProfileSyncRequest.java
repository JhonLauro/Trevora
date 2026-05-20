package com.trevora.api.features.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SupabaseProfileSyncRequest(
        @NotBlank String firstName,
        @NotBlank String lastName,
        @NotNull UserRole role
) {
}
