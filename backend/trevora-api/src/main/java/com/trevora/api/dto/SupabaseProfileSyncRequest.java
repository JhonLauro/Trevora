package com.trevora.api.dto;

import com.trevora.api.enums.UserRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SupabaseProfileSyncRequest(
        @NotBlank String firstName,
        @NotBlank String lastName,
        @NotNull UserRole role
) {
}
