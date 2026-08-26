package com.trevora.api.features.auth;

import java.time.Instant;
import java.util.UUID;

public record CurrentUserResponse(
        UUID userId,
        String firstName,
        String lastName,
        String fullName,
        String email,
        String role,
        /* Null means the onboarding walkthrough has never been shown. It rides
           along with the profile the app already fetches on load rather than
           costing a second request the welcome screen would have to wait on. */
        Instant walkthroughCompletedAt
) {
}
