package com.trevora.api.features.servicerecord;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftItem;
import com.trevora.api.features.serviceinput.ServiceDraftLineEntry;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.serviceinput.ServiceInputService;
import com.trevora.api.features.serviceinput.ServiceLineKind;
import com.trevora.api.features.validation.ServiceDraftValidationService;
import com.trevora.api.features.validation.ValidationResult;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ServiceRecordServiceTest {
    private static final UUID OWNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Mock
    private ServiceInputService serviceInputService;
    @Mock
    private ServiceDraftRepository serviceDraftRepository;
    @Mock
    private ServiceRecordRepository serviceRecordRepository;
    @Mock
    private ServiceRecordItemRepository serviceRecordItemRepository;
    @Mock
    private ServiceRecordLineEntryRepository serviceRecordLineEntryRepository;
    @Mock
    private ServiceRecordItemReader serviceRecordItemReader;
    @Mock
    private ServiceDraftValidationService serviceDraftValidationService;
    @Mock
    private CurrentUserService currentUserService;

    private ServiceRecordService serviceRecordService;

    @BeforeEach
    void setUp() {
        serviceRecordService = new ServiceRecordService(
                serviceInputService,
                serviceDraftRepository,
                serviceRecordRepository,
                serviceRecordItemRepository,
                serviceRecordLineEntryRepository,
                serviceRecordItemReader,
                serviceDraftValidationService,
                currentUserService
        );
    }

    @Test
    void confirmDraftPromotesEachDraftItemIntoItsOwnRecordItem() {
        UUID draftId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();

        ServiceDraft draft = new ServiceDraft();
        draft.setVehicleId(vehicleId);
        draft.setOwnerId(OWNER_ID);
        draft.setInputMethod(InputMethod.MANUAL);
        draft.setServiceDate(LocalDate.now());
        draft.setTotalCost(BigDecimal.valueOf(2500));
        draft.setStatus(DraftStatus.READY_FOR_REVIEW);

        ServiceDraftItem oilChange = itemFor("Oil Change", "Oil filter", "Drain and refill", 0);
        ServiceDraftItem tireRotation = itemFor("Tire Rotation", null, "Rotate all four tires", 1);
        List<ServiceDraftItem> draftItems = List.of(oilChange, tireRotation);

        when(currentUserService.getCurrentUserId()).thenReturn(OWNER_ID);
        when(serviceInputService.getDraftForMockOwner(draftId)).thenReturn(draft);
        when(serviceInputService.getItemsForDraft(any())).thenReturn(draftItems);
        when(serviceDraftValidationService.validateDraft(draft, draftItems))
                .thenReturn(new ValidationResult(draftId, true, List.of(), List.of(), List.of("All required fields are present.")));
        when(serviceRecordRepository.findByDraftIdAndOwnerId(any(), any())).thenReturn(Optional.empty());
        when(serviceRecordRepository.save(any(ServiceRecord.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(serviceDraftRepository.save(any(ServiceDraft.class))).thenAnswer(invocation -> invocation.getArgument(0));

        List<ServiceRecordItem> savedRecordItems = new ArrayList<>();
        when(serviceRecordItemRepository.save(any(ServiceRecordItem.class))).thenAnswer(invocation -> {
            ServiceRecordItem item = invocation.getArgument(0);
            savedRecordItems.add(item);
            return item;
        });
        when(serviceRecordItemRepository.findByRecordIdOrderBySortOrder(any())).thenReturn(savedRecordItems);
        when(serviceRecordItemReader.forRecord(any())).thenReturn(savedRecordItems);

        var response = serviceRecordService.confirmDraft(draftId);

        assertThat(savedRecordItems).hasSize(2);
        assertThat(savedRecordItems).extracting(ServiceRecordItem::getServiceType)
                .containsExactly("Oil Change", "Tire Rotation");
        assertThat(savedRecordItems).extracting(ServiceRecordItem::getPartsReplaced)
                .containsExactly("Oil filter", null);
        assertThat(response.serviceRecord().services()).hasSize(2);
        assertThat(response.serviceRecord().services()).extracting(item -> item.serviceType())
                .containsExactly("Oil Change", "Tire Rotation");
    }

    @Test
    void confirmDraftCarriesEachReceiptLineOntoTheRecordWithItsKind() {
        UUID draftId = UUID.randomUUID();

        ServiceDraft draft = new ServiceDraft();
        draft.setVehicleId(UUID.randomUUID());
        draft.setOwnerId(OWNER_ID);
        draft.setInputMethod(InputMethod.RECEIPT);
        draft.setServiceDate(LocalDate.now());
        draft.setTotalCost(BigDecimal.valueOf(12046));
        draft.setStatus(DraftStatus.READY_FOR_REVIEW);

        // The three kinds that a body-and-paint invoice actually mixes: the job
        // performed, a part fitted, and a consumable used up doing it.
        ServiceDraftItem bodyWork = itemFor("Body and paint", null, "Painting job", 0);
        bodyWork.setLineEntries(List.of(
                lineFor(ServiceLineKind.OPERATION, "PAINTING JOB", "TTY-SUB-PM-BP", 0),
                lineFor(ServiceLineKind.PART, "PLASTIC COVER SET", "TTY06-PROTS-HEENT", 1),
                lineFor(ServiceLineKind.MATERIAL, "WASTE PAD - BP", "TTY-WASTE PAD", 2)
        ));
        List<ServiceDraftItem> draftItems = List.of(bodyWork);

        when(currentUserService.getCurrentUserId()).thenReturn(OWNER_ID);
        when(serviceInputService.getDraftForMockOwner(draftId)).thenReturn(draft);
        when(serviceInputService.getItemsForDraft(any())).thenReturn(draftItems);
        when(serviceDraftValidationService.validateDraft(draft, draftItems))
                .thenReturn(new ValidationResult(draftId, true, List.of(), List.of(), List.of("All required fields are present.")));
        when(serviceRecordRepository.findByDraftIdAndOwnerId(any(), any())).thenReturn(Optional.empty());
        when(serviceRecordRepository.save(any(ServiceRecord.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(serviceDraftRepository.save(any(ServiceDraft.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(serviceRecordItemRepository.save(any(ServiceRecordItem.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(serviceRecordItemRepository.findByRecordIdOrderBySortOrder(any())).thenReturn(List.of());
        when(serviceRecordItemReader.forRecord(any())).thenReturn(List.of());

        List<ServiceRecordLineEntry> savedEntries = new ArrayList<>();
        when(serviceRecordLineEntryRepository.save(any(ServiceRecordLineEntry.class))).thenAnswer(invocation -> {
            ServiceRecordLineEntry entry = invocation.getArgument(0);
            savedEntries.add(entry);
            return entry;
        });

        serviceRecordService.confirmDraft(draftId);

        assertThat(savedEntries).extracting(ServiceRecordLineEntry::getKind)
                .containsExactly(ServiceLineKind.OPERATION, ServiceLineKind.PART, ServiceLineKind.MATERIAL);
        assertThat(savedEntries).extracting(ServiceRecordLineEntry::getDescription)
                .containsExactly("PAINTING JOB", "PLASTIC COVER SET", "WASTE PAD - BP");
        assertThat(savedEntries).extracting(ServiceRecordLineEntry::getPartCode)
                .containsExactly("TTY-SUB-PM-BP", "TTY06-PROTS-HEENT", "TTY-WASTE PAD");
    }

    private ServiceDraftLineEntry lineFor(ServiceLineKind kind, String description, String partCode, int sortOrder) {
        ServiceDraftLineEntry entry = new ServiceDraftLineEntry();
        entry.setItemId(UUID.randomUUID());
        entry.setKind(kind);
        entry.setDescription(description);
        entry.setPartCode(partCode);
        entry.setSortOrder(sortOrder);
        return entry;
    }

    private ServiceDraftItem itemFor(String serviceType, String partsReplaced, String laborPerformed, int sortOrder) {
        ServiceDraftItem item = new ServiceDraftItem();
        item.setDraftId(UUID.randomUUID());
        item.setServiceType(serviceType);
        item.setPartsReplaced(partsReplaced);
        item.setLaborPerformed(laborPerformed);
        item.setSortOrder(sortOrder);
        item.setServiceCategory("Maintenance");
        return item;
    }
}
