package com.trevora.api.service;

import com.trevora.api.dto.CurrentUser;
import com.trevora.api.enums.UserRole;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Service
public class CurrentUserService {
    public static final UUID MOCK_OWNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    public static final UserRole MOCK_OWNER_ROLE = UserRole.VEHICLE_OWNER;

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";

    public CurrentUser getCurrentUser() {
        HttpServletRequest request = currentRequest();
        if (request == null) {
            return mockOwner();
        }

        UUID userId = parseUserId(request.getHeader(USER_ID_HEADER));
        UserRole role = parseUserRole(request.getHeader(USER_ROLE_HEADER));
        if (userId == null || role == null) {
            return mockOwner();
        }

        return new CurrentUser(userId, role);
    }

    public UUID getCurrentUserId() {
        return getCurrentUser().userId();
    }

    private HttpServletRequest currentRequest() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            return attributes.getRequest();
        }
        return null;
    }

    private CurrentUser mockOwner() {
        return new CurrentUser(MOCK_OWNER_ID, MOCK_OWNER_ROLE);
    }

    private UUID parseUserId(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private UserRole parseUserRole(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UserRole.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }
}
