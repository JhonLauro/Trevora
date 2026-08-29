package com.trevora.api.features.auth;

import java.util.UUID;

/**
 * What was removed. `receiptsFound` and `receiptsDeleted` differ only when
 * Supabase Storage rejected part of the cleanup — the account is gone either
 * way, so the client reports the difference rather than treating it as failure.
 */
public record AccountDeletionResponse(
        UUID userId,
        int receiptsFound,
        int receiptsDeleted,
        boolean storageFullyCleared
) {
}
