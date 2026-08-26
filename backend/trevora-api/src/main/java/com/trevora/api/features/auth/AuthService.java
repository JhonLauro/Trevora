package com.trevora.api.features.auth;

import com.trevora.api.shared.exception.AuthException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordHashingService passwordHashingService;
    private final CurrentUserService currentUserService;
    private final SupabaseAuthService supabaseAuthService;

    public AuthService(
            UserRepository userRepository,
            PasswordHashingService passwordHashingService,
            CurrentUserService currentUserService,
            SupabaseAuthService supabaseAuthService
    ) {
        this.userRepository = userRepository;
        this.passwordHashingService = passwordHashingService;
        this.currentUserService = currentUserService;
        this.supabaseAuthService = supabaseAuthService;
    }

    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new AuthException("An account with this email already exists.");
        }

        User user = new User();
        user.setUserId(UUID.randomUUID());
        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordHashingService.hash(request.password()));
        user.setRole(UserRole.VEHICLE_OWNER.name());

        return AuthResponse.from(userRepository.save(user));
    }

    public AuthResponse syncSupabaseProfile(SupabaseProfileSyncRequest request, HttpServletRequest servletRequest) {
        SupabaseAuthenticatedUser supabaseUser = supabaseAuthService.requireCurrentUser(servletRequest);
        String email = normalizeEmail(supabaseUser.email());
        User user = userRepository.findById(supabaseUser.userId())
                .or(() -> userRepository.findByEmailIgnoreCase(email))
                .orElseGet(User::new);
        String preservedRole = user.getRole();
        user.setUserId(supabaseUser.userId());
        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());
        user.setEmail(email);
        user.setRole(UserRole.ADMIN.name().equals(preservedRole) ? UserRole.ADMIN.name() : UserRole.VEHICLE_OWNER.name());
        return AuthResponse.from(userRepository.save(user));
    }

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmailIgnoreCase(normalizeEmail(request.email()))
                .orElseThrow(() -> new AuthException("Email or password is incorrect."));

        if (!passwordHashingService.matches(request.password(), user.getPasswordHash())) {
            throw new AuthException("Email or password is incorrect.");
        }

        return AuthResponse.from(user);
    }

    public CurrentUserResponse getCurrentUser() {
        CurrentUser currentUser = currentUserService.getCurrentUser();
        return userRepository.findById(currentUser.userId())
                .map(AuthService::toCurrentUserResponse)
                .orElseGet(() -> new CurrentUserResponse(
                        currentUser.userId(),
                        "Current",
                        "User",
                        "Current User",
                        null,
                        currentUser.role().name(),
                        null
                ));
    }

    /**
     * Records that the signed-in owner has been shown the walkthrough.
     *
     * <p>Idempotent, because the caller cannot be trusted to fire it exactly
     * once -- skipping and finishing both report it, and a reload could repeat
     * either. The entity keeps the first timestamp; this returns the whole
     * profile so the frontend reconciles against the server's answer rather
     * than the one it just sent.
     */
    public CurrentUserResponse markWalkthroughSeen() {
        CurrentUser currentUser = currentUserService.getCurrentUser();
        User user = userRepository.findById(currentUser.userId())
                .orElseThrow(() -> new AuthException("Your profile is not synced yet. Sign in again to continue."));

        if (user.hasSeenWalkthrough()) {
            return toCurrentUserResponse(user);
        }

        user.markWalkthroughSeen(Instant.now());
        return toCurrentUserResponse(userRepository.save(user));
    }

    private static CurrentUserResponse toCurrentUserResponse(User user) {
        return new CurrentUserResponse(
                user.getUserId(),
                user.getFirstName(),
                user.getLastName(),
                user.getFullName(),
                user.getEmail(),
                user.normalizedRole(),
                user.getWalkthroughCompletedAt()
        );
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
