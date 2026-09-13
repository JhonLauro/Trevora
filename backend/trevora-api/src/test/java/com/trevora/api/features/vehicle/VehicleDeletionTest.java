package com.trevora.api.features.vehicle;

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
import com.trevora.api.features.mechanicaccess.MechanicAccessSessionRepository;
import com.trevora.api.features.serviceinput.ReceiptFiles;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.sharing.MechanicAccessRepository;
import com.trevora.api.features.sharing.QRAccessRepository;
import com.trevora.api.shared.exception.DeletionUnavailableException;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.data.domain.Sort;

class VehicleDeletionTest {

    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID VEHICLE = UUID.randomUUID();

    private final VehicleRepository vehicles = mock(VehicleRepository.class);
    private final CurrentUserService users = mock(CurrentUserService.class);
    private final ServiceRecordRepository records = mock(ServiceRecordRepository.class);
    private final ServiceDraftRepository drafts = mock(ServiceDraftRepository.class);
    private final QRAccessRepository shareLinks = mock(QRAccessRepository.class);
    private final MechanicAccessRepository requests = mock(MechanicAccessRepository.class);
    private final MechanicAccessSessionRepository sessions = mock(MechanicAccessSessionRepository.class);
    private final ReceiptFiles files = mock(ReceiptFiles.class);

    private final VehicleService service = new VehicleService(
            vehicles, users, records, drafts, shareLinks, requests, sessions, files);

    private final VehicleProfile vehicle = new VehicleProfile();

    @BeforeEach
    void vehicleWithARecordAndADraft() {
        ServiceRecord record = new ServiceRecord();
        record.setReceiptStoragePath("owner/vehicle/record.jpg");
        ServiceDraft draft = new ServiceDraft();
        draft.setReceiptStoragePath("owner/vehicle/draft.jpg");

        when(users.getCurrentUserId()).thenReturn(OWNER);
        when(vehicles.findByVehicleIdAndOwnerId(VEHICLE, OWNER)).thenReturn(Optional.of(vehicle));
        when(records.findByVehicleIdAndOwnerId(eq(VEHICLE), eq(OWNER), any(Sort.class))).thenReturn(List.of(record));
        when(drafts.findByVehicleIdAndOwnerId(VEHICLE, OWNER)).thenReturn(List.of(draft));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void everyFileGoesBeforeAnyRow() {
        service.deleteVehicleForCurrentUser(VEHICLE);

        ArgumentCaptor<Collection<ReceiptFiles.StoredReceipt>> removed = ArgumentCaptor.forClass((Class) Collection.class);
        InOrder order = inOrder(files, sessions, records, drafts, vehicles);
        order.verify(files).removeOrRefuse(removed.capture(), eq("vehicle"), anyString());
        order.verify(sessions).deleteByVehicleId(VEHICLE);
        order.verify(records).deleteByVehicleId(VEHICLE);
        order.verify(drafts).deleteByVehicleId(VEHICLE);
        order.verify(vehicles).delete(vehicle);
        assertThat(removed.getValue()).hasSize(2);
    }

    @Test
    void aRefusalDeletesNothing() {
        doThrow(new DeletionUnavailableException("vehicle")).when(files).removeOrRefuse(any(), any(), any());

        assertThrows(DeletionUnavailableException.class, () -> service.deleteVehicleForCurrentUser(VEHICLE));

        verify(sessions, never()).deleteByVehicleId(any());
        verify(records, never()).deleteByVehicleId(any());
        verify(drafts, never()).deleteByVehicleId(any());
        verify(vehicles, never()).delete(any());
    }
}
