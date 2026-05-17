package com.trevora.api.dto;

import com.trevora.api.enums.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank String fullName,
        @Email @NotBlank String email,
        @NotBlank @Size(min = 8, message = "must be at least 8 characters") String password,
        @NotNull UserRole role
) {
}
