package com.trevora.api.features.servicerecord;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.serviceinput.ServiceInputService;
import com.trevora.api.features.validation.ServiceDraftValidationService;
import com.trevora.api.features.serviceinput.ServiceDraftResponse;
import com.trevora.api.features.servicerecord.ServiceRecordConfirmationResponse;
import com.trevora.api.features.servicerecord.ServiceRecordResponse;
import com.trevora.api.features.validation.ValidationResult;
import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.shared.exception.InvalidServiceRecordConfirmationException;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ServiceRecordService {
    private final ServiceInputService serviceInputService;
    private final ServiceDraftRepository serviceDraftRepository;
    private final ServiceRecordRepository serviceRecordRepository;
    private final ServiceDraftValidationService serviceDraftValidationService;
    private final CurrentUserService currentUserService;

    public ServiceRecordService(
            ServiceInputService serviceInputService,
            ServiceDraftRepository serviceDraftRepository,
            ServiceRecordRepository serviceRecordRepository,
            ServiceDraftValidationService serviceDraftValidationService,
            CurrentUserService currentUserService
    ) {
        this.serviceInputService = serviceInputService;
        this.serviceDraftRepository = serviceDraftRepository;
        this.serviceRecordRepository = serviceRecordRepository;
        this.serviceDraftValidationService = serviceDraftValidationService;
        this.currentUserService = currentUserService;
    }

    @Transactional
    public ServiceRecordConfirmationResponse confirmDraft(UUID draftId) {
        currentUserService.requireVehicleOwner();
        ServiceDraft draft = serviceInputService.getDraftForMockOwner(draftId);
        ValidationResult validation = serviceDraftValidationService.validateDraft(draft);
        if (!validation.valid()) {
            throw new InvalidServiceRecordConfirmationException(
                    "Complete vehicle, service date, and total cost before confirming this record."
            );
        }

        ServiceRecord record = serviceRecordRepository
                .findByDraftIdAndOwnerId(draft.getDraftId(), currentUserService.getCurrentUserId())
                .orElseGet(ServiceRecord::new);
        copyDraftToRecord(draft, record);

        ServiceRecord savedRecord = serviceRecordRepository.save(record);
        draft.setStatus(DraftStatus.CONFIRMED);
        ServiceDraft savedDraft = serviceDraftRepository.save(draft);

        return new ServiceRecordConfirmationResponse(
                ServiceRecordResponse.from(savedRecord),
                ServiceDraftResponse.from(savedDraft),
                validation,
                "Service record saved."
        );
    }

    private void copyDraftToRecord(ServiceDraft draft, ServiceRecord record) {
        record.setDraftId(draft.getDraftId());
        record.setVehicleId(draft.getVehicleId());
        record.setOwnerId(draft.getOwnerId());
        record.setSourceInputMethod(draft.getInputMethod());
        record.setServiceDate(draft.getServiceDate());
        record.setServiceType(blankToNull(draft.getServiceType()));
        record.setOdometer(draft.getOdometer());
        record.setTotalCost(draft.getTotalCost());
        record.setShopName(draft.getShopName());
        record.setLocation(draft.getLocation());
        record.setPartsReplaced(draft.getPartsReplaced());
        record.setLaborPerformed(draft.getLaborPerformed());
        record.setRemarks(draft.getRemarks());
        record.setFieldMetadata(draft.getFieldMetadata());
        record.setReceiptStorageBucket(draft.getReceiptStorageBucket());
        record.setReceiptStoragePath(draft.getReceiptStoragePath());
        record.setReceiptOriginalFilename(draft.getReceiptOriginalFilename());
        record.setReceiptContentType(draft.getReceiptContentType());
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
