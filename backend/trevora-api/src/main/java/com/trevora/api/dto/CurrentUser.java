package com.trevora.api.dto;

import com.trevora.api.enums.UserRole;
import java.util.UUID;

public record CurrentUser(UUID userId, UserRole role) {
}
