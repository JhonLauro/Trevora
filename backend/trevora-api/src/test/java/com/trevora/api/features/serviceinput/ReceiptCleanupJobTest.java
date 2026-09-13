package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.trevora.api.shared.exception.DeletionUnavailableException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.transaction.PlatformTransactionManager;

class ReceiptCleanupJobTest {

    private final ServiceDraftRepository drafts = mock(ServiceDraftRepository.class);
    private final ReceiptFiles files = mock(ReceiptFiles.class);
    private final ReceiptUploadFingerprints fingerprints = mock(ReceiptUploadFingerprints.class);

    /** The two queries stubbed, so the test needs no database. */
    private ReceiptCleanupJob job(String mode, List<UUID> orphanIds, List<ReceiptCleanupJob.UnreferencedObject> objects) {
        return new ReceiptCleanupJob(mode, null, drafts, files, fingerprints, mock(PlatformTransactionManager.class)) {
            @Override
            List<UUID> orphanDraftIds() {
                return orphanIds;
            }

            @Override
            List<UnreferencedObject> unreferencedObjects() {
                return objects;
            }
        };
    }

    private ServiceDraft orphan(UUID id) {
        ServiceDraft draft = new ServiceDraft();
        draft.setStatus(DraftStatus.CONFIRMED);
        draft.setReceiptStoragePath("owner/vehicle/" + id + ".jpg");
        return draft;
    }

    private static List<ReceiptCleanupJob.UnreferencedObject> objects(int count) {
        return IntStream.range(0, count)
                .mapToObj(i -> new ReceiptCleanupJob.UnreferencedObject("owner/vehicle/" + i + ".jpg", Instant.EPOCH))
                .toList();
    }

    @Test
    void readsModesStrictly() {
        assertThat(ReceiptCleanupJob.parse(null)).isEqualTo(ReceiptCleanupJob.Mode.OFF);
        assertThat(ReceiptCleanupJob.parse(" ")).isEqualTo(ReceiptCleanupJob.Mode.OFF);
        assertThat(ReceiptCleanupJob.parse("dry-run")).isEqualTo(ReceiptCleanupJob.Mode.DRY_RUN);
        assertThat(ReceiptCleanupJob.parse("DELETE")).isEqualTo(ReceiptCleanupJob.Mode.DELETE);
        assertThat(ReceiptCleanupJob.parse("yes")).isEqualTo(ReceiptCleanupJob.Mode.INVALID);
    }

    @Test
    void offAndInvalidTouchNothing() {
        job("", List.of(UUID.randomUUID()), objects(3)).run();
        job("true", List.of(UUID.randomUUID()), objects(3)).run();

        verifyNoInteractions(drafts, files, fingerprints);
    }

    @Test
    void aDryRunRemovesNothing() {
        UUID id = UUID.randomUUID();
        when(drafts.findAllById(List.of(id))).thenReturn(List.of(orphan(id)));

        job("dry-run", List.of(id), objects(120)).run();

        verify(files, never()).removeOrRefuse(any(), anyString(), anyString());
        verify(drafts, never()).delete(any());
        verify(fingerprints, never()).forget(any());
    }

    @Test
    void deleteRemovesAnOrphansFilesBeforeItsRowAndPhotosInBatches() {
        UUID id = UUID.randomUUID();
        ServiceDraft draft = orphan(id);
        when(drafts.findAllById(List.of(id))).thenReturn(List.of(draft));

        job("delete", List.of(id), objects(120)).run();

        InOrder order = inOrder(files, drafts);
        order.verify(files).removeOrRefuse(eq(ReceiptFiles.of(draft)), eq("draft"), anyString());
        order.verify(drafts).delete(draft);
        verify(files, times(2)).removeOrRefuse(any(), eq("photos"), anyString());
    }

    @Test
    void aStorageRefusalLeavesTheDraftRow() {
        UUID id = UUID.randomUUID();
        when(drafts.findAllById(List.of(id))).thenReturn(List.of(orphan(id)));
        doThrow(new DeletionUnavailableException("draft")).when(files).removeOrRefuse(any(), anyString(), anyString());

        job("delete", List.of(id), objects(5)).run();

        verify(drafts, never()).delete(any());
        verify(fingerprints, never()).forget(any());
    }
}
