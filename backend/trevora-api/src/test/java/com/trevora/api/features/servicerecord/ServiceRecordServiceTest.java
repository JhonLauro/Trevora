package com.trevora.api.features.servicerecord;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftItem;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.serviceinput.ServiceInputService;
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
