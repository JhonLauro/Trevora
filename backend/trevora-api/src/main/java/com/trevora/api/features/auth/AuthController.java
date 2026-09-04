package com.trevora.api.features.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import java.util.List;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final AccountDeletionService accountDeletionService;
    private final UserTipService userTipService;

    public AuthController(
            AuthService authService,
            AccountDeletionService accountDeletionService,
            UserTipService userTipService
    ) {
        this.authService = authService;
        this.accountDeletionService = accountDeletionService;
        this.userTipService = userTipService;
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

    /**
     * The in-app tips this owner has already been shown.
     *
     * <p>Keys only. What each one says and where it points is the frontend's,
     * so there is nothing here for the server to describe.
     */
    @GetMapping("/me/tips")
    public List<String> seenTips() {
        return userTipService.seenTipKeys();
    }

    /** Returns the full set rather than nothing, so the caller reconciles
        against the server's answer instead of the one it just sent. */
    @PostMapping("/me/tips/{tipKey}/seen")
    public List<String> markTipSeen(@PathVariable String tipKey) {
        return userTipService.markTipSeen(tipKey);
    }
}
