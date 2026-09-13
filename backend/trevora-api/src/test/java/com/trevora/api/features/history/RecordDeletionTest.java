package com.trevora.api.features.history;

import static org.assertj.core.api.Assertions.assertThat;
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

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.serviceinput.ReceiptFiles;
import com.trevora.api.features.serviceinput.ReceiptUploadFingerprints;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordItemReader;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.shared.exception.DeletionUnavailableException;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

class RecordDeletionTest {

    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID VEHICLE = UUID.randomUUID();
    private static final UUID RECORD = UUID.randomUUID();
    private static final UUID DRAFT = UUID.randomUUID();

    private final ServiceRecordRepository records = mock(ServiceRecordRepository.class);
    private final ServiceDraftRepository drafts = mock(ServiceDraftRepository.class);
    private final CurrentUserService users = mock(CurrentUserService.class);
    private final ReceiptFiles files = mock(ReceiptFiles.class);
    private final ReceiptUploadFingerprints fingerprints = mock(ReceiptUploadFingerprints.class);

    private final ServiceHistoryService service = new ServiceHistoryService(
            records, mock(ServiceRecordItemReader.class), mock(VehicleService.class), users,
            drafts, files, fingerprints);

    private ServiceRecord record;
    private ServiceDraft draft;

    @BeforeEach
    void storedRecordAndItsConfirmedDraft() {
        record = new ServiceRecord();
        record.setDraftId(DRAFT);
        record.setReceiptStoragePath("owner/vehicle/page-1.jpg");
        draft = new ServiceDraft();
        draft.setReceiptStoragePath("owner/vehicle/page-2.jpg");

        when(users.getCurrentUserId()).thenReturn(OWNER);
        when(records.findByRecordIdAndVehicleIdAndOwnerId(RECORD, VEHICLE, OWNER)).thenReturn(Optional.of(record));
        when(drafts.findByDraftIdAndOwnerId(DRAFT, OWNER)).thenReturn(Optional.of(draft));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void deletingARecordTakesItsDraftAndEveryFileFirst() {
        service.deleteVehicleHistoryRecord(VEHICLE, RECORD);

        ArgumentCaptor<Collection<ReceiptFiles.StoredReceipt>> removed = ArgumentCaptor.forClass((Class) Collection.class);
        InOrder order = inOrder(files, records, drafts);
        order.verify(files).removeOrRefuse(removed.capture(), eq("record"), anyString());
        order.verify(records).delete(record);
        order.verify(drafts).delete(draft);
        verify(fingerprints).forget(DRAFT);
        assertThat(removed.getValue()).containsExactlyInAnyOrder(
                new ReceiptFiles.StoredReceipt("service-receipts", "owner/vehicle/page-1.jpg"),
                new ReceiptFiles.StoredReceipt("service-receipts", "owner/vehicle/page-2.jpg"));
    }

    @Test
    void aRefusalLeavesTheRecordAndItsDraft() {
        doThrow(new DeletionUnavailableException("record")).when(files).removeOrRefuse(any(), any(), any());

        assertThrows(DeletionUnavailableException.class, () -> service.deleteVehicleHistoryRecord(VEHICLE, RECORD));

        verify(records, never()).delete(any());
        verify(drafts, never()).delete(any());
        verify(fingerprints, never()).forget(any());
    }
}
