package com.trevora.api.dto;

import com.trevora.api.model.User;
import java.util.UUID;

public record AuthResponse(
        UUID userId,
        String firstName,
        String lastName,
        String fullName,
        String email,
        String role
) {
    public static AuthResponse from(User user) {
        return new AuthResponse(
                user.getUserId(),
                user.getFirstName(),
                user.getLastName(),
                user.getFullName(),
                user.getEmail(),
                user.normalizedRole()
        );
    }
}
