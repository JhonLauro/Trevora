package com.trevora.api.service;

import com.trevora.api.dto.ServiceDraftResponse;
import com.trevora.api.dto.ServiceRecordConfirmationResponse;
import com.trevora.api.dto.ServiceRecordResponse;
import com.trevora.api.dto.ValidationResult;
import com.trevora.api.enums.DraftStatus;
import com.trevora.api.exception.InvalidServiceRecordConfirmationException;
import com.trevora.api.model.ServiceDraft;
import com.trevora.api.model.ServiceRecord;
import com.trevora.api.repository.ServiceDraftRepository;
import com.trevora.api.repository.ServiceRecordRepository;
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
        ServiceDraft draft = serviceInputService.getDraftForMockOwner(draftId);
        ValidationResult validation = serviceDraftValidationService.validateDraft(draft);
        if (!validation.valid()) {
            throw new InvalidServiceRecordConfirmationException(
                    "Complete vehicle, service date, service type, and total cost before confirming this record."
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
        record.setServiceType(draft.getServiceType().trim());
        record.setOdometer(draft.getOdometer());
        record.setTotalCost(draft.getTotalCost());
        record.setShopName(draft.getShopName());
        record.setLocation(draft.getLocation());
        record.setPartsReplaced(draft.getPartsReplaced());
        record.setLaborPerformed(draft.getLaborPerformed());
        record.setRemarks(draft.getRemarks());
        record.setFieldMetadata(draft.getFieldMetadata());
    }
}
