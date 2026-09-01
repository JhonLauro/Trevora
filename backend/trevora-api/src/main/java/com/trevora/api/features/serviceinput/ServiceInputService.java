package com.trevora.api.features.serviceinput;


import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.vehicle.VehicleProfile;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.features.serviceinput.ManualServiceDraftRequest;
import com.trevora.api.features.serviceinput.ReceiptExtractionResult;
import com.trevora.api.features.serviceinput.VoiceDraftExtractionResult;
import com.trevora.api.features.serviceinput.VoiceServiceDraftRequest;
import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ServiceInputService {
    private final ServiceDraftRepository serviceDraftRepository;
    private final ServiceDraftItemRepository serviceDraftItemRepository;
    private final ServiceDraftLineEntryRepository serviceDraftLineEntryRepository;
    private final VehicleService vehicleService;
    private final OCRProcessingService ocrProcessingService;
    private final VoiceProcessingService voiceProcessingService;
    private final CurrentUserService currentUserService;
    private final ObjectMapper objectMapper;
    private final ServiceClassificationService classificationService;

    public ServiceInputService(
            ServiceDraftRepository serviceDraftRepository,
            ServiceDraftItemRepository serviceDraftItemRepository,
            ServiceDraftLineEntryRepository serviceDraftLineEntryRepository,
            VehicleService vehicleService,
            OCRProcessingService ocrProcessingService,
            VoiceProcessingService voiceProcessingService,
            CurrentUserService currentUserService,
            ObjectMapper objectMapper,
            ServiceClassificationService classificationService
    ) {
        this.serviceDraftRepository = serviceDraftRepository;
        this.serviceDraftItemRepository = serviceDraftItemRepository;
        this.serviceDraftLineEntryRepository = serviceDraftLineEntryRepository;
        this.vehicleService = vehicleService;
        this.ocrProcessingService = ocrProcessingService;
        this.voiceProcessingService = voiceProcessingService;
        this.currentUserService = currentUserService;
        this.objectMapper = objectMapper;
        this.classificationService = classificationService;
    }

    @Transactional
    public ServiceDraft createManualDraft(ManualServiceDraftRequest request) {
        requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToCurrentUser(request.vehicleId());

        ServiceDraft draft = new ServiceDraft();
        draft.setVehicleId(request.vehicleId());
        draft.setOwnerId(currentUserService.getCurrentUserId());
        draft.setInputMethod(InputMethod.MANUAL);
        draft.setServiceDate(request.serviceDate());
        draft.setOdometer(request.odometer());
        draft.setTotalCost(request.totalCost());
        draft.setShopName(blankToNull(request.shopName()));
        draft.setLocation(blankToNull(request.location()));
        draft.setRemarks(blankToNull(request.remarks()));
        draft.setStatus(DraftStatus.DRAFT);
        Map<String, Object> manualMetadata = new LinkedHashMap<>();
        manualMetadata.put("inputMethod", "MANUAL");
        manualMetadata.put("source", "owner_entered");
        draft.setFieldMetadata(manualMetadata);

        ServiceDraft savedDraft = serviceDraftRepository.save(draft);
        saveManualItems(savedDraft.getDraftId(), request.services(), draft.getRemarks());
        return savedDraft;
    }

    public ServiceDraft createReceiptDraft(
            UUID vehicleId,
            MultipartFile receiptImage,
            String receiptStorageBucket,
            String receiptStoragePath,
            String receiptOriginalFilename,
            String receiptContentType
    ) {
        return createReceiptDraft(
                vehicleId,
                List.of(receiptImage),
                "UPLOAD",
                receiptStorageBucket,
                receiptStoragePath,
                receiptOriginalFilename,
                receiptContentType,
                null
        );
    }

    @Transactional
    public ServiceDraft createReceiptDraft(
            UUID vehicleId,
            List<MultipartFile> receiptImages,
            String receiptInputMode,
            String receiptStorageBucket,
            String receiptStoragePath,
            String receiptOriginalFilename,
            String receiptContentType,
            String receiptPagesJson
    ) {
        requireVehicleOwner();
        // The ownership check already loads the vehicle, and the extractor needs
        // it: a receipt only means something against the vehicle it belongs to.
        VehicleProfile vehicle = vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId);
        ReceiptExtractionResult extraction = ocrProcessingService.extractReceiptFields(
                receiptImages, receiptInputMode, VehicleContext.from(vehicle));

        ServiceDraft draft = new ServiceDraft();
        draft.setVehicleId(vehicleId);
        draft.setOwnerId(currentUserService.getCurrentUserId());
        draft.setInputMethod(InputMethod.RECEIPT);
        // Which sheet of the stack this came off. The voice path leaves the
        // default: a spoken account is not a document and has no type to read.
        draft.setDocumentType(extraction.documentType());
        draft.setServiceDate(extraction.serviceDate());
        draft.setOdometer(extraction.odometer());
        draft.setTotalCost(extraction.totalCost());
        draft.setShopName(blankToNull(extraction.shopName()));
        draft.setLocation(blankToNull(extraction.location()));
        draft.setRemarks(blankToNull(extraction.remarks()));
        draft.setStatus(DraftStatus.DRAFT);
        draft.setFieldMetadata(enrichReceiptMetadata(extraction.fieldMetadata(), receiptPagesJson));
        draft.setReceiptStorageBucket(blankToNull(receiptStorageBucket));
        draft.setReceiptStoragePath(blankToNull(receiptStoragePath));
        draft.setReceiptOriginalFilename(blankToNull(receiptOriginalFilename));
        draft.setReceiptContentType(blankToNull(receiptContentType));

        ServiceDraft savedDraft = serviceDraftRepository.save(draft);
        saveExtractedItems(savedDraft.getDraftId(), extraction.services());
        return savedDraft;
    }

    private Map<String, Object> enrichReceiptMetadata(Map<String, Object> metadata, String receiptPagesJson) {
        Map<String, Object> enriched = new LinkedHashMap<>(metadata == null ? Map.of() : metadata);
        List<Map<String, Object>> storedPages = parseReceiptPages(receiptPagesJson);
        if (!storedPages.isEmpty()) {
            enriched.put("storedReceiptPages", storedPages);
        }
        return enriched;
    }

    private List<Map<String, Object>> parseReceiptPages(String receiptPagesJson) {
        if (receiptPagesJson == null || receiptPagesJson.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(receiptPagesJson, new TypeReference<>() {});
        } catch (JsonProcessingException ignored) {
            return List.of();
        }
    }

    @Transactional
    public ServiceDraft createVoiceDraft(VoiceServiceDraftRequest request) {
        requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToCurrentUser(request.vehicleId());
        VoiceDraftExtractionResult extraction = voiceProcessingService.extractServiceFields(request.transcript());

        ServiceDraft draft = new ServiceDraft();
        draft.setVehicleId(request.vehicleId());
        draft.setOwnerId(currentUserService.getCurrentUserId());
        draft.setInputMethod(InputMethod.VOICE);
        draft.setServiceDate(extraction.serviceDate());
        draft.setOdometer(extraction.odometer());
        draft.setTotalCost(extraction.totalCost());
        draft.setShopName(blankToNull(extraction.shopName()));
        draft.setLocation(blankToNull(extraction.location()));
        draft.setRemarks(blankToNull(extraction.remarks()));
        draft.setStatus(DraftStatus.DRAFT);
        draft.setFieldMetadata(extraction.fieldMetadata());

        ServiceDraft savedDraft = serviceDraftRepository.save(draft);
        saveExtractedItems(savedDraft.getDraftId(), extraction.services());
        return savedDraft;
    }


    public ServiceDraft getDraftForCurrentUser(UUID draftId) {
        return serviceDraftRepository.findByDraftIdAndOwnerId(draftId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Service draft was not found."));
    }

    /**
     * The draft's services, each hydrated with its receipt lines.
     *
     * <p>Every read path for draft items goes through here, which is what makes
     * {@link ServiceDraftItem#getLineEntries()} safe to read without checking
     * whether someone remembered to populate it. Lines are fetched in one query
     * for the whole draft rather than one per item.
     */
    public List<ServiceDraftItem> getItemsForDraft(UUID draftId) {
        return hydrateLineEntries(serviceDraftItemRepository.findByDraftIdOrderBySortOrder(draftId));
    }

    private List<ServiceDraftItem> hydrateLineEntries(List<ServiceDraftItem> items) {
        if (items.isEmpty()) {
            return items;
        }
        Map<UUID, List<ServiceDraftLineEntry>> byItem = serviceDraftLineEntryRepository
                .findByItemIdInOrderByItemIdAscSortOrderAsc(items.stream().map(ServiceDraftItem::getItemId).toList())
                .stream()
                .collect(Collectors.groupingBy(ServiceDraftLineEntry::getItemId));
        items.forEach(item -> item.setLineEntries(byItem.getOrDefault(item.getItemId(), List.of())));
        return items;
    }

    /**
     * Persists the receipt lines under an item.
     *
     * <p>Kind is resolved through {@link ServiceLineKind#fromNullable}, so a
     * value neither the model nor the client recognises lands on MATERIAL
     * rather than failing the whole save. A miscategorised line is a correction
     * the owner can make; a rejected draft is a receipt they have to re-shoot.
     */
    /**
     * The lines to store for one item: the ones sent, or the ones it already
     * had when the request stayed silent about them.
     */
    private List<ServiceLineEntryFields> linesFor(
            ServiceItemRequest itemRequest,
            Map<UUID, List<ServiceLineEntryFields>> existingLines
    ) {
        if (itemRequest.specifiesLineEntries()) {
            return itemRequest.lineEntriesOrEmpty().stream()
                    .map(request -> new ServiceLineEntryFields(
                            request.kind(),
                            request.description(),
                            request.partCode(),
                            request.quantity(),
                            request.unitPrice(),
                            request.lineTotal()
                    ))
                    .toList();
        }
        if (itemRequest.itemId() == null) {
            return List.of();
        }
        return existingLines.getOrDefault(itemRequest.itemId(), List.of());
    }

    private void saveLineEntries(UUID itemId, List<ServiceLineEntryFields> entries) {
        int order = 0;
        for (ServiceLineEntryFields fields : entries) {
            String description = blankToNull(fields.description());
            if (description == null) {
                continue;
            }
            ServiceDraftLineEntry entry = new ServiceDraftLineEntry();
            entry.setItemId(itemId);
            entry.setKind(ServiceLineKind.fromNullable(fields.kind()));
            entry.setDescription(description);
            entry.setPartCode(blankToNull(fields.partCode()));
            entry.setQuantity(fields.quantity());
            entry.setUnitPrice(fields.unitPrice());
            entry.setLineTotal(fields.lineTotal());
            entry.setSortOrder(order++);
            serviceDraftLineEntryRepository.save(entry);
        }
    }

    /**
     * Rewrites a draft's items from a correction request.
     *
     * <p>The items are deleted and rebuilt rather than updated in place, which
     * takes their line entries with them — the foreign key cascades. So the
     * lines are read first, and any item whose request does not mention them
     * gets its own lines back. See {@link ServiceItemRequest} for why absent
     * has to mean unchanged: without it, one client that did not know about
     * line entries would quietly delete the entire itemised receipt on the
     * owner's first correction.
     */
    @Transactional
    public List<ServiceDraftItem> replaceDraftItems(UUID draftId, List<ServiceItemRequest> items, String remarksContext) {
        Map<UUID, List<ServiceLineEntryFields>> existingLines = lineEntriesByItem(draftId);
        serviceDraftItemRepository.deleteByDraftId(draftId);
        saveItems(draftId, items, remarksContext, existingLines);
        return getItemsForDraft(draftId);
    }

    /** Every item's current lines, keyed by the item they belong to. */
    private Map<UUID, List<ServiceLineEntryFields>> lineEntriesByItem(UUID draftId) {
        Map<UUID, List<ServiceLineEntryFields>> byItem = new LinkedHashMap<>();
        for (ServiceDraftItem item : getItemsForDraft(draftId)) {
            byItem.put(item.getItemId(), item.getLineEntries().stream()
                    .map(entry -> new ServiceLineEntryFields(
                            entry.getKind() == null ? null : entry.getKind().name(),
                            entry.getDescription(),
                            entry.getPartCode(),
                            entry.getQuantity(),
                            entry.getUnitPrice(),
                            entry.getLineTotal()
                    ))
                    .toList());
        }
        return byItem;
    }

    private void saveManualItems(UUID draftId, List<ServiceItemRequest> items, String remarksContext) {
        saveItems(draftId, items, remarksContext, Map.of());
    }

    private void saveItems(
            UUID draftId,
            List<ServiceItemRequest> items,
            String remarksContext,
            Map<UUID, List<ServiceLineEntryFields>> existingLines
    ) {
        if (items == null) {
            return;
        }
        int order = 0;
        for (ServiceItemRequest itemRequest : items) {
            String serviceType = blankToNull(itemRequest.serviceType());
            if (serviceType == null) {
                continue;
            }
            ServiceDraftItem item = new ServiceDraftItem();
            item.setDraftId(draftId);
            item.setServiceType(serviceType);
            item.setPartsReplaced(blankToNull(itemRequest.partsReplaced()));
            item.setLaborPerformed(blankToNull(itemRequest.laborPerformed()));
            item.setLineCost(itemRequest.lineCost());
            item.setSortOrder(order++);
            ServiceClassification classification = classificationService.keywordFallback(
                    null,
                    item.getServiceType(),
                    item.getPartsReplaced(),
                    item.getLaborPerformed(),
                    remarksContext,
                    1
            );
            item.setServiceCategory(classification.serviceCategory());
            item.setFieldMetadata(classification.toMetadata());
            ServiceDraftItem savedItem = serviceDraftItemRepository.save(item);
            saveLineEntries(savedItem.getItemId(), linesFor(itemRequest, existingLines));
        }
    }

    private void saveExtractedItems(UUID draftId, List<ServiceItemFields> items) {
        if (items == null) {
            return;
        }
        int order = 0;
        for (ServiceItemFields itemFields : items) {
            String serviceType = blankToNull(itemFields.serviceType());
            if (serviceType == null) {
                continue;
            }
            ServiceDraftItem item = new ServiceDraftItem();
            item.setDraftId(draftId);
            item.setServiceType(serviceType);
            item.setPartsReplaced(blankToNull(itemFields.partsReplaced()));
            item.setLaborPerformed(blankToNull(itemFields.laborPerformed()));
            item.setLineCost(itemFields.lineCost());
            item.setSortOrder(order++);
            ServiceClassification classification = itemFields.classification();
            if (classification != null) {
                item.setServiceCategory(classification.serviceCategory());
                item.setFieldMetadata(classification.toMetadata());
            }
            ServiceDraftItem savedItem = serviceDraftItemRepository.save(item);
            saveLineEntries(savedItem.getItemId(), itemFields.lineEntriesOrEmpty());
        }
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private void requireVehicleOwner() {
        currentUserService.requireVehicleOwner();
    }
}
