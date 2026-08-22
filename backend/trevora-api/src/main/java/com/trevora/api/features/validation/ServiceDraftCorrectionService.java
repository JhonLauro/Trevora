package com.trevora.api.features.validation;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.serviceinput.ServiceInputService;
import com.trevora.api.features.validation.ServiceDraftCorrectionRequest;
import com.trevora.api.features.serviceinput.ServiceDraftItem;
import com.trevora.api.features.serviceinput.ServiceDraftResponse;
import com.trevora.api.features.validation.ServiceDraftReviewResponse;
import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
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
        draft.setOdometer(request.odometer());
        draft.setTotalCost(request.totalCost());
        draft.setAmountCovered(cappedCoverage(request.amountCovered(), request.totalCost()));
        draft.setShopName(blankToNull(request.shopName()));
        draft.setLocation(blankToNull(request.location()));
        draft.setRemarks(blankToNull(request.remarks()));
        draft.setStatus(DraftStatus.READY_FOR_REVIEW);
        draft.setFieldMetadata(withCorrectionMetadata(draft.getFieldMetadata()));

        ServiceDraft savedDraft = serviceDraftRepository.save(draft);
        List<ServiceDraftItem> items = request.services() == null
                ? serviceInputService.getItemsForDraft(savedDraft.getDraftId())
                : serviceInputService.replaceDraftItems(savedDraft.getDraftId(), request.services(), savedDraft.getRemarks());

        return new ServiceDraftReviewResponse(
                ServiceDraftResponse.from(savedDraft, items),
                serviceDraftValidationService.validateDraft(savedDraft, items)
        );
    }

    /**
     * Coverage can never exceed the invoice it belongs to.
     *
     * The database enforces this too, but a constraint violation surfaces as a
     * 500 rather than as anything the owner can act on, and the honest reading
     * of "covered 6,000 of a 5,000 bill" is that the whole bill was covered.
     */
    private BigDecimal cappedCoverage(BigDecimal covered, BigDecimal totalCost) {
        if (covered == null || covered.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        if (totalCost == null) {
            return covered;
        }
        return covered.min(totalCost);
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
