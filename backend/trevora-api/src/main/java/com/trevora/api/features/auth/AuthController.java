package com.trevora.api.features.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final AccountDeletionService accountDeletionService;

    public AuthController(AuthService authService, AccountDeletionService accountDeletionService) {
        this.authService = authService;
        this.accountDeletionService = accountDeletionService;
    }

    @PostMapping("/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/sync")
    public AuthResponse sync(@Valid @RequestBody SupabaseProfileSyncRequest request, HttpServletRequest servletRequest) {
        return authService.syncSupabaseProfile(request, servletRequest);
    }

    /**
     * Permanently removes the signed-in owner's account and everything filed
     * under it. There is no undo and no soft-delete flag: the row is gone and
     * the database cascades take the rest.
     */
    @DeleteMapping("/account")
    public AccountDeletionResponse deleteAccount() {
        return accountDeletionService.deleteCurrentAccount();
    }

    @GetMapping("/me")
    public CurrentUserResponse me() {
        return authService.getCurrentUser();
    }

    @PostMapping("/me/walkthrough/seen")
    public CurrentUserResponse markWalkthroughSeen() {
        return authService.markWalkthroughSeen();
    }
}
