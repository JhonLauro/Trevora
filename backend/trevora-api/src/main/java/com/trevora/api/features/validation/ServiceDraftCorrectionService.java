package com.trevora.api.features.validation;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.serviceinput.ServiceInputService;
import com.trevora.api.features.validation.ServiceDraftCorrectionRequest;
import com.trevora.api.features.serviceinput.ServiceDraftResponse;
import com.trevora.api.features.validation.ServiceDraftReviewResponse;
import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ServiceDraftCorrectionService {
    private final ServiceInputService serviceInputService;
    private final ServiceDraftRepository serviceDraftRepository;
    private final ServiceDraftValidationService serviceDraftValidationService;
    private final CurrentUserService currentUserService;

    public ServiceDraftCorrectionService(
            ServiceInputService serviceInputService,
            ServiceDraftRepository serviceDraftRepository,
            ServiceDraftValidationService serviceDraftValidationService,
            CurrentUserService currentUserService
    ) {
        this.serviceInputService = serviceInputService;
        this.serviceDraftRepository = serviceDraftRepository;
        this.serviceDraftValidationService = serviceDraftValidationService;
        this.currentUserService = currentUserService;
    }

    @Transactional
    public ServiceDraftReviewResponse correctDraft(UUID draftId, ServiceDraftCorrectionRequest request) {
        currentUserService.requireVehicleOwner();
        ServiceDraft draft = serviceInputService.getDraftForMockOwner(draftId);

        draft.setServiceDate(request.serviceDate());
        draft.setServiceType(blankToNull(request.serviceType()));
        draft.setOdometer(request.odometer());
        draft.setTotalCost(request.totalCost());
        draft.setShopName(blankToNull(request.shopName()));
        draft.setLocation(blankToNull(request.location()));
        draft.setPartsReplaced(blankToNull(request.partsReplaced()));
        draft.setLaborPerformed(blankToNull(request.laborPerformed()));
        draft.setRemarks(blankToNull(request.remarks()));
        draft.setStatus(DraftStatus.READY_FOR_REVIEW);
        draft.setFieldMetadata(withCorrectionMetadata(draft.getFieldMetadata()));

        ServiceDraft savedDraft = serviceDraftRepository.save(draft);
        return new ServiceDraftReviewResponse(
                ServiceDraftResponse.from(savedDraft),
                serviceDraftValidationService.validateDraft(savedDraft)
        );
    }

    private Map<String, Object> withCorrectionMetadata(Map<String, Object> existingMetadata) {
        Map<String, Object> metadata = existingMetadata == null ? new HashMap<>() : new HashMap<>(existingMetadata);
        metadata.put("ownerCorrected", true);
        return metadata;
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
