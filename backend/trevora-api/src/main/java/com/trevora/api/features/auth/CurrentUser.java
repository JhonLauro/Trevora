package com.trevora.api.features.auth;

import com.trevora.api.features.auth.UserRole;
import java.util.UUID;

public record CurrentUser(UUID userId, UserRole role) {
}
