package com.trevora.api.features.servicerecord;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.serviceinput.ServiceDraftItem;
import com.trevora.api.features.serviceinput.ServiceDraftLineEntry;
import com.trevora.api.features.serviceinput.ServiceInputService;
import com.trevora.api.features.validation.ServiceDraftValidationService;
import com.trevora.api.features.serviceinput.ServiceDraftResponse;
import com.trevora.api.features.servicerecord.ServiceRecordConfirmationResponse;
import com.trevora.api.features.servicerecord.ServiceRecordResponse;
import com.trevora.api.features.validation.ValidationResult;
import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.shared.exception.InvalidServiceRecordConfirmationException;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ServiceRecordService {
    private final ServiceInputService serviceInputService;
    private final ServiceDraftRepository serviceDraftRepository;
    private final ServiceRecordRepository serviceRecordRepository;
    private final ServiceRecordItemRepository serviceRecordItemRepository;
    private final ServiceRecordLineEntryRepository serviceRecordLineEntryRepository;
    private final ServiceRecordItemReader serviceRecordItemReader;
    private final ServiceDraftValidationService serviceDraftValidationService;
    private final CurrentUserService currentUserService;

    public ServiceRecordService(
            ServiceInputService serviceInputService,
            ServiceDraftRepository serviceDraftRepository,
            ServiceRecordRepository serviceRecordRepository,
            ServiceRecordItemRepository serviceRecordItemRepository,
            ServiceRecordLineEntryRepository serviceRecordLineEntryRepository,
            ServiceRecordItemReader serviceRecordItemReader,
            ServiceDraftValidationService serviceDraftValidationService,
            CurrentUserService currentUserService
    ) {
        this.serviceInputService = serviceInputService;
        this.serviceDraftRepository = serviceDraftRepository;
        this.serviceRecordRepository = serviceRecordRepository;
        this.serviceRecordItemRepository = serviceRecordItemRepository;
        this.serviceRecordLineEntryRepository = serviceRecordLineEntryRepository;
        this.serviceRecordItemReader = serviceRecordItemReader;
        this.serviceDraftValidationService = serviceDraftValidationService;
        this.currentUserService = currentUserService;
    }

    @Transactional
    public ServiceRecordConfirmationResponse confirmDraft(UUID draftId) {
        currentUserService.requireVehicleOwner();
        ServiceDraft draft = serviceInputService.getDraftForCurrentUser(draftId);
        List<ServiceDraftItem> draftItems = serviceInputService.getItemsForDraft(draft.getDraftId());
        ValidationResult validation = serviceDraftValidationService.validateDraft(draft, draftItems);
        if (!validation.valid()) {
            throw new InvalidServiceRecordConfirmationException(
                    "Complete vehicle, service date, total cost, and at least one service before confirming this record."
            );
        }

        ServiceRecord record = serviceRecordRepository
                .findByDraftIdAndOwnerId(draft.getDraftId(), currentUserService.getCurrentUserId())
                .orElseGet(ServiceRecord::new);
        copyDraftToRecord(draft, record);

        ServiceRecord savedRecord = serviceRecordRepository.save(record);
        List<ServiceRecordItem> recordItems = promoteItems(draftItems, savedRecord.getRecordId());
        draft.setStatus(DraftStatus.CONFIRMED);
        ServiceDraft savedDraft = serviceDraftRepository.save(draft);

        return new ServiceRecordConfirmationResponse(
                ServiceRecordResponse.from(savedRecord, recordItems),
                ServiceDraftResponse.from(savedDraft, draftItems),
                validation,
                "Service record saved."
        );
    }

    /**
     * Decides whether a human is accountable for this record's fields.
     *
     * Two things count as accountability, and both are things that actually
     * happened rather than things we hope happened:
     *
     * - **Manual entry.** Nothing was extracted; the owner is the source.
     * - **A correction pass.** ServiceDraftCorrectionService moves a draft to
     *   READY_FOR_REVIEW, so that status is evidence the owner opened the
     *   fields and edited them.
     *
     * Everything else — a receipt or voice note confirmed straight off the
     * extraction — is NEEDS_REVIEW. That will mark some genuinely fine records
     * as unverified, and that is the right direction to be wrong in: the owner
     * can clear it in one click, whereas a wrongly validated record is a claim
     * nobody ever revisits.
     */
    private ValidationStatus validationStatusFor(ServiceDraft draft) {
        if (draft.getInputMethod() == InputMethod.MANUAL) {
            return ValidationStatus.VALIDATED;
        }
        if (draft.getStatus() == DraftStatus.READY_FOR_REVIEW) {
            return ValidationStatus.VALIDATED;
        }
        return ValidationStatus.NEEDS_REVIEW;
    }

    /**
     * Copies the draft's services onto the confirmed record, receipt lines and
     * all.
     *
     * <p>Confirming is re-runnable, so the previous items are deleted first.
     * Their line entries go with them by FK cascade, but the delete is issued
     * explicitly here because the items are removed by a derived delete that
     * Hibernate may satisfy without loading the children — leaving the cascade
     * as the only thing standing between a re-confirm and a duplicated receipt.
     */
    private List<ServiceRecordItem> promoteItems(List<ServiceDraftItem> draftItems, UUID recordId) {
        List<ServiceRecordItem> existing = serviceRecordItemRepository.findByRecordIdOrderBySortOrder(recordId);
        if (!existing.isEmpty()) {
            serviceRecordLineEntryRepository.deleteByItemIdIn(
                    existing.stream().map(ServiceRecordItem::getItemId).toList()
            );
        }
        serviceRecordItemRepository.deleteByRecordId(recordId);

        for (ServiceDraftItem draftItem : draftItems) {
            ServiceRecordItem recordItem = new ServiceRecordItem();
            recordItem.setRecordId(recordId);
            recordItem.setServiceType(draftItem.getServiceType());
            recordItem.setServiceCategory(draftItem.getServiceCategory());
            recordItem.setPartsReplaced(draftItem.getPartsReplaced());
            recordItem.setLaborPerformed(draftItem.getLaborPerformed());
            recordItem.setLineCost(draftItem.getLineCost());
            recordItem.setSortOrder(draftItem.getSortOrder());
            recordItem.setFieldMetadata(draftItem.getFieldMetadata());
            ServiceRecordItem savedItem = serviceRecordItemRepository.save(recordItem);
            promoteLineEntries(draftItem.getLineEntries(), savedItem.getItemId());
        }
        return serviceRecordItemReader.forRecord(recordId);
    }

    private void promoteLineEntries(List<ServiceDraftLineEntry> draftEntries, UUID itemId) {
        for (ServiceDraftLineEntry draftEntry : draftEntries) {
            ServiceRecordLineEntry entry = new ServiceRecordLineEntry();
            entry.setItemId(itemId);
            entry.setKind(draftEntry.getKind());
            entry.setDescription(draftEntry.getDescription());
            entry.setPartCode(draftEntry.getPartCode());
            entry.setQuantity(draftEntry.getQuantity());
            entry.setUnitPrice(draftEntry.getUnitPrice());
            entry.setLineTotal(draftEntry.getLineTotal());
            entry.setSortOrder(draftEntry.getSortOrder());
            entry.setFieldMetadata(draftEntry.getFieldMetadata());
            serviceRecordLineEntryRepository.save(entry);
        }
    }

    private void copyDraftToRecord(ServiceDraft draft, ServiceRecord record) {
        record.setDraftId(draft.getDraftId());
        record.setVehicleId(draft.getVehicleId());
        record.setOwnerId(draft.getOwnerId());
        record.setSourceInputMethod(draft.getInputMethod());
        record.setValidationStatus(validationStatusFor(draft));
        // Travels with the record. A confirmed record whose cost came off an
        // estimate is still an estimate's cost, and history has no other way to
        // know that once the draft is gone.
        record.setDocumentType(draft.getDocumentType());
        record.setServiceDate(draft.getServiceDate());
        record.setOdometer(draft.getOdometer());
        record.setTotalCost(draft.getTotalCost());
        record.setAmountCovered(draft.getAmountCovered());
        record.setShopName(draft.getShopName());
        record.setLocation(draft.getLocation());
        record.setRemarks(draft.getRemarks());
        record.setFieldMetadata(draft.getFieldMetadata());
        record.setReceiptStorageBucket(draft.getReceiptStorageBucket());
        record.setReceiptStoragePath(draft.getReceiptStoragePath());
        record.setReceiptOriginalFilename(draft.getReceiptOriginalFilename());
        record.setReceiptContentType(draft.getReceiptContentType());
    }
}
