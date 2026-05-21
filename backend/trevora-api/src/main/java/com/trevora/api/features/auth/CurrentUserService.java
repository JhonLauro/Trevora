package com.trevora.api.features.auth;


import com.trevora.api.shared.exception.UnauthorizedVehicleAccessException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Service
public class CurrentUserService {
    public static final UUID MOCK_OWNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private final SupabaseAuthService supabaseAuthService;

    public CurrentUserService(SupabaseAuthService supabaseAuthService) {
        this.supabaseAuthService = supabaseAuthService;
    }

    public CurrentUser getCurrentUser() {
        HttpServletRequest request = currentRequest();
        if (request == null) {
            throw unauthenticated();
        }

        return supabaseAuthService.getCurrentUser(request)
                .map(user -> new CurrentUser(user.userId(), user.role()))
                .orElseThrow(this::unauthenticated);
    }

    public UUID getCurrentUserId() {
        return getCurrentUser().userId();
    }

    public UserRole getCurrentUserRole() {
        return getCurrentUser().role();
    }

    public boolean isCurrentUserVehicleOwner() {
        return UserRole.VEHICLE_OWNER == getCurrentUserRole();
    }

    public void requireVehicleOwner() {
        if (!isCurrentUserVehicleOwner()) {
            throw new com.trevora.api.shared.exception.UnauthorizedVehicleAccessException(
                    "Vehicle owner role is required for this action."
            );
        }
    }

    private HttpServletRequest currentRequest() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            return attributes.getRequest();
        }
        return null;
    }

    private UnauthorizedVehicleAccessException unauthenticated() {
        return new UnauthorizedVehicleAccessException("Sign in is required for this action.");
    }
}
