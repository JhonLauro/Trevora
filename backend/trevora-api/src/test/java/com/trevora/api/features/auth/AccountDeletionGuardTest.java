package com.trevora.api.features.auth;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.trevora.api.features.serviceinput.ReceiptFiles;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.shared.exception.DeletionUnavailableException;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;

/**
 * The deletion path is destructive and cannot be exercised for real in a unit
 * test, so what is pinned here are the branches that must never drift: the
 * refusal when no service-role key is configured, and files being removed
 * before the account so a Storage failure deletes nothing.
 *
 * Without that key the server can empty the app tables but cannot remove the
 * Supabase auth user or the receipt images. An owner would appear to delete
 * their account and then sign straight back into a working, empty one, or leave
 * their photos behind. Refusing is the whole point, so it is worth a test that
 * fails loudly if someone later "fixes" this by letting it proceed.
 */
class AccountDeletionGuardTest {

    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final ServiceRecordRepository recordRepository = mock(ServiceRecordRepository.class);
    private final ServiceDraftRepository draftRepository = mock(ServiceDraftRepository.class);

    private AccountDeletionService service(String supabaseUrl, String serviceRoleKey) {
        return new AccountDeletionService(currentUserService, recordRepository, draftRepository,
                new ReceiptFiles(supabaseUrl, serviceRoleKey), supabaseUrl, serviceRoleKey);
    }

    @Test
    @DisplayName("refuses to delete anything when no service-role key is set, and says nothing was removed")
    void refusesWithoutServiceRoleKey() {
        DeletionUnavailableException thrown = assertThrows(
                DeletionUnavailableException.class,
                () -> service("https://project.supabase.co", "").deleteCurrentAccount());

        assertTrue(thrown.getMessage().contains("nothing was removed"),
                "the owner must be told nothing was removed, got: " + thrown.getMessage());
    }

    @Test
    @DisplayName("refuses when the Supabase URL is missing too")
    void refusesWithoutSupabaseUrl() {
        assertThrows(DeletionUnavailableException.class,
                () -> service("", "service-role-key").deleteCurrentAccount());
    }

    @Test
    @DisplayName("touches nothing at all when it refuses")
    void refusalReadsNoData() {
        assertThrows(DeletionUnavailableException.class,
                () -> service("", "").deleteCurrentAccount());

        // Not even the current user is resolved: the guard runs first, so a
        // misconfigured server cannot start reading an account it is about to
        // decline to delete.
        verifyNoInteractions(currentUserService, recordRepository, draftRepository);
    }

    @Test
    @DisplayName("a Storage refusal stops before the account is touched")
    void filesAreRemovedBeforeTheAccount() {
        when(currentUserService.getCurrentUserId()).thenReturn(UUID.randomUUID());
        when(recordRepository.findByOwnerId(any(), any(Sort.class))).thenReturn(List.of());
        when(draftRepository.findByOwnerId(any())).thenReturn(List.of());
        ReceiptFiles refusing = mock(ReceiptFiles.class);
        doThrow(new DeletionUnavailableException("account")).when(refusing).removeOrRefuse(any(), anyString(), anyString());
        AccountDeletionService service = new AccountDeletionService(currentUserService, recordRepository,
                draftRepository, refusing, "https://project.supabase.co", "service-role-key");

        DeletionUnavailableException thrown = assertThrows(DeletionUnavailableException.class,
                service::deleteCurrentAccount);

        // Had the auth user been deleted first, its failure would say photos may already be gone.
        assertTrue(thrown.getMessage().contains("nothing was removed"), thrown.getMessage());
    }
}
