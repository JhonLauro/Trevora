package com.trevora.api.features.serviceinput;


import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.CurrentUserService;
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
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ServiceInputService {
    private final ServiceDraftRepository serviceDraftRepository;
    private final VehicleService vehicleService;
    private final OCRProcessingService ocrProcessingService;
    private final VoiceProcessingService voiceProcessingService;
    private final CurrentUserService currentUserService;
    private final ObjectMapper objectMapper;
    private final ServiceClassificationService classificationService;

    public ServiceInputService(
            ServiceDraftRepository serviceDraftRepository,
            VehicleService vehicleService,
            OCRProcessingService ocrProcessingService,
            VoiceProcessingService voiceProcessingService,
            CurrentUserService currentUserService,
            ObjectMapper objectMapper,
            ServiceClassificationService classificationService
    ) {
        this.serviceDraftRepository = serviceDraftRepository;
        this.vehicleService = vehicleService;
        this.ocrProcessingService = ocrProcessingService;
        this.voiceProcessingService = voiceProcessingService;
        this.currentUserService = currentUserService;
        this.objectMapper = objectMapper;
        this.classificationService = classificationService;
    }

    public ServiceDraft createManualDraft(ManualServiceDraftRequest request) {
        requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToMockOwner(request.vehicleId());

        ServiceDraft draft = new ServiceDraft();
        draft.setVehicleId(request.vehicleId());
        draft.setOwnerId(currentUserService.getCurrentUserId());
        draft.setInputMethod(InputMethod.MANUAL);
        draft.setServiceDate(request.serviceDate());
        draft.setServiceType(blankToNull(request.serviceType()));
        draft.setOdometer(request.odometer());
        draft.setTotalCost(request.totalCost());
        draft.setShopName(blankToNull(request.shopName()));
        draft.setLocation(blankToNull(request.location()));
        draft.setPartsReplaced(blankToNull(request.partsReplaced()));
        draft.setLaborPerformed(blankToNull(request.laborPerformed()));
        draft.setRemarks(blankToNull(request.remarks()));
        draft.setStatus(DraftStatus.DRAFT);
        ServiceClassification classification = classificationService.keywordFallback(
                null,
                draft.getServiceType(),
                draft.getPartsReplaced(),
                draft.getLaborPerformed(),
                draft.getRemarks(),
                1
        );
        Map<String, Object> manualMetadata = new LinkedHashMap<>();
        manualMetadata.put("inputMethod", "MANUAL");
        manualMetadata.put("source", "owner_entered");
        manualMetadata.put("classification", classification.toMetadata());
        draft.setFieldMetadata(manualMetadata);

        return serviceDraftRepository.save(draft);
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
        vehicleService.verifyVehicleBelongsToMockOwner(vehicleId);
        ReceiptExtractionResult extraction = ocrProcessingService.extractReceiptFields(receiptImages, receiptInputMode);

        ServiceDraft draft = new ServiceDraft();
        draft.setVehicleId(vehicleId);
        draft.setOwnerId(currentUserService.getCurrentUserId());
        draft.setInputMethod(InputMethod.RECEIPT);
        draft.setServiceDate(extraction.serviceDate());
        draft.setServiceType(extraction.serviceType());
        draft.setOdometer(extraction.odometer());
        draft.setTotalCost(extraction.totalCost());
        draft.setShopName(blankToNull(extraction.shopName()));
        draft.setLocation(blankToNull(extraction.location()));
        draft.setPartsReplaced(blankToNull(extraction.partsReplaced()));
        draft.setLaborPerformed(blankToNull(extraction.laborPerformed()));
        draft.setRemarks(blankToNull(extraction.remarks()));
        draft.setStatus(DraftStatus.DRAFT);
        draft.setFieldMetadata(enrichReceiptMetadata(extraction.fieldMetadata(), receiptPagesJson));
        draft.setReceiptStorageBucket(blankToNull(receiptStorageBucket));
        draft.setReceiptStoragePath(blankToNull(receiptStoragePath));
        draft.setReceiptOriginalFilename(blankToNull(receiptOriginalFilename));
        draft.setReceiptContentType(blankToNull(receiptContentType));

        return serviceDraftRepository.save(draft);
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

    public ServiceDraft createVoiceDraft(VoiceServiceDraftRequest request) {
        requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToMockOwner(request.vehicleId());
        VoiceDraftExtractionResult extraction = voiceProcessingService.extractServiceFields(request.transcript());

        ServiceDraft draft = new ServiceDraft();
        draft.setVehicleId(request.vehicleId());
        draft.setOwnerId(currentUserService.getCurrentUserId());
        draft.setInputMethod(InputMethod.VOICE);
        draft.setServiceDate(extraction.serviceDate());
        draft.setServiceType(extraction.serviceType());
        draft.setOdometer(extraction.odometer());
        draft.setTotalCost(extraction.totalCost());
        draft.setShopName(blankToNull(extraction.shopName()));
        draft.setLocation(blankToNull(extraction.location()));
        draft.setPartsReplaced(blankToNull(extraction.partsReplaced()));
        draft.setLaborPerformed(blankToNull(extraction.laborPerformed()));
        draft.setRemarks(blankToNull(extraction.remarks()));
        draft.setStatus(DraftStatus.DRAFT);
        draft.setFieldMetadata(extraction.fieldMetadata());

        return serviceDraftRepository.save(draft);
    }

    public ServiceDraft getDraftForMockOwner(UUID draftId) {
        return getDraftForCurrentUser(draftId);
    }

    public ServiceDraft getDraftForCurrentUser(UUID draftId) {
        return serviceDraftRepository.findByDraftIdAndOwnerId(draftId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Service draft was not found."));
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
