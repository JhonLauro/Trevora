package com.trevora.api.features.serviceinput;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.shared.exception.DeletionUnavailableException;
import com.trevora.api.shared.exception.DraftHasRecordException;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class DraftDeletionTest {

    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID DRAFT = UUID.randomUUID();

    private final ServiceDraftRepository drafts = mock(ServiceDraftRepository.class);
    private final CurrentUserService users = mock(CurrentUserService.class);
    private final ReceiptFiles files = mock(ReceiptFiles.class);
    private final ReceiptUploadFingerprints fingerprints = mock(ReceiptUploadFingerprints.class);

    private final ServiceInputService service = new ServiceInputService(
            drafts,
            mock(ServiceDraftItemRepository.class),
            mock(ServiceDraftLineEntryRepository.class),
            mock(VehicleService.class),
            mock(OCRProcessingService.class),
            mock(VoiceProcessingService.class),
            users,
            new ObjectMapper(),
            new ServiceClassificationService(),
            fingerprints,
            files);

    private ServiceDraft stored(DraftStatus status) {
        ServiceDraft draft = new ServiceDraft();
        draft.setStatus(status);
        draft.setReceiptStoragePath("owner/vehicle/page-1.jpg");
        when(users.getCurrentUserId()).thenReturn(OWNER);
        when(drafts.findByDraftIdAndOwnerId(DRAFT, OWNER)).thenReturn(Optional.of(draft));
        return draft;
    }

    @Test
    void aConfirmedDraftIsRefusedAndNothingIsTouched() {
        stored(DraftStatus.CONFIRMED);

        assertThrows(DraftHasRecordException.class, () -> service.deleteDraftForCurrentUser(DRAFT));

        verify(files, never()).removeOrRefuse(any(), any(), any());
        verify(drafts, never()).delete(any());
    }

    @Test
    void filesGoFirstThenTheRows() {
        ServiceDraft draft = stored(DraftStatus.READY_FOR_REVIEW);

        service.deleteDraftForCurrentUser(DRAFT);

        InOrder order = inOrder(files, fingerprints, drafts);
        order.verify(files).removeOrRefuse(eq(ReceiptFiles.of(draft)), eq("draft"), anyString());
        order.verify(fingerprints).forget(DRAFT);
        order.verify(drafts).delete(draft);
    }

    @Test
    void aRefusalDeletesNoRows() {
        stored(DraftStatus.DRAFT);
        doThrow(new DeletionUnavailableException("draft")).when(files).removeOrRefuse(any(), any(), any());

        assertThrows(DeletionUnavailableException.class, () -> service.deleteDraftForCurrentUser(DRAFT));

        verify(fingerprints, never()).forget(any());
        verify(drafts, never()).delete(any());
    }
}
