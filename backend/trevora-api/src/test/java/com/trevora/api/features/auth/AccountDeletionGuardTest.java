package com.trevora.api.features.auth;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.shared.exception.AccessRequestException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The deletion path is destructive and cannot be exercised for real in a unit
 * test, so what is pinned here is the one branch that must never drift: the
 * refusal when no service-role key is configured.
 *
 * Without that key the server can empty the app tables but cannot remove the
 * Supabase auth user or the receipt images. An owner would appear to delete
 * their account and then sign straight back into a working, empty one — the
 * half-deleted state migration 016 was written to end. Refusing is the whole
 * point, so it is worth a test that fails loudly if someone later "fixes" this
 * by letting it proceed.
 */
class AccountDeletionGuardTest {

    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final ServiceRecordRepository recordRepository = mock(ServiceRecordRepository.class);
    private final ServiceDraftRepository draftRepository = mock(ServiceDraftRepository.class);

    private AccountDeletionService service(String supabaseUrl, String serviceRoleKey) {
        return new AccountDeletionService(
                currentUserService, recordRepository, draftRepository, supabaseUrl, serviceRoleKey);
    }

    @Test
    @DisplayName("refuses to delete anything when no service-role key is set")
    void refusesWithoutServiceRoleKey() {
        AccessRequestException thrown = assertThrows(
                AccessRequestException.class,
                () -> service("https://project.supabase.co", "").deleteCurrentAccount());

        assertTrue(thrown.getMessage().contains("SUPABASE_SERVICE_ROLE_KEY"),
                "the message should name the missing setting, got: " + thrown.getMessage());
    }

    @Test
    @DisplayName("refuses when the Supabase URL is missing too")
    void refusesWithoutSupabaseUrl() {
        assertThrows(AccessRequestException.class,
                () -> service("", "service-role-key").deleteCurrentAccount());
    }

    @Test
    @DisplayName("touches nothing at all when it refuses")
    void refusalReadsNoData() {
        assertThrows(AccessRequestException.class,
                () -> service("", "").deleteCurrentAccount());

        // Not even the current user is resolved: the guard runs first, so a
        // misconfigured server cannot start reading an account it is about to
        // decline to delete.
        verifyNoInteractions(currentUserService, recordRepository, draftRepository);
    }
}
