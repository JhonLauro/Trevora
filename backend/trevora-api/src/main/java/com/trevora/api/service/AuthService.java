package com.trevora.api.service;

import com.trevora.api.dto.AuthResponse;
import com.trevora.api.dto.CurrentUser;
import com.trevora.api.dto.CurrentUserResponse;
import com.trevora.api.dto.LoginRequest;
import com.trevora.api.dto.RegisterRequest;
import com.trevora.api.dto.SupabaseAuthenticatedUser;
import com.trevora.api.dto.SupabaseProfileSyncRequest;
import com.trevora.api.exception.AuthException;
import com.trevora.api.model.User;
import com.trevora.api.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
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
        user.setRole(request.role().name());

        return AuthResponse.from(userRepository.save(user));
    }

    public AuthResponse syncSupabaseProfile(SupabaseProfileSyncRequest request, HttpServletRequest servletRequest) {
        SupabaseAuthenticatedUser supabaseUser = supabaseAuthService.requireCurrentUser(servletRequest);
        String email = normalizeEmail(supabaseUser.email());
        User user = userRepository.findById(supabaseUser.userId())
                .or(() -> userRepository.findByEmailIgnoreCase(email))
                .orElseGet(User::new);
        user.setUserId(supabaseUser.userId());
        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());
        user.setEmail(email);
        user.setRole(request.role().name());
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
                .map(user -> new CurrentUserResponse(
                        user.getUserId(),
                        user.getFirstName(),
                        user.getLastName(),
                        user.getFullName(),
                        user.getEmail(),
                        user.normalizedRole()
                ))
                .orElseGet(() -> new CurrentUserResponse(
                        currentUser.userId(),
                        "Current",
                        "User",
                        "Current User",
                        null,
                        currentUser.role().name()
                ));
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
