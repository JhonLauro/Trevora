package com.trevora.api.features.serviceinput;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.features.serviceinput.ManualServiceDraftRequest;
import com.trevora.api.features.serviceinput.MockReceiptExtraction;
import com.trevora.api.features.serviceinput.MockVoiceExtraction;
import com.trevora.api.features.serviceinput.VoiceServiceDraftRequest;
import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import java.util.Map;
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

    public ServiceInputService(
            ServiceDraftRepository serviceDraftRepository,
            VehicleService vehicleService,
            OCRProcessingService ocrProcessingService,
            VoiceProcessingService voiceProcessingService,
            CurrentUserService currentUserService
    ) {
        this.serviceDraftRepository = serviceDraftRepository;
        this.vehicleService = vehicleService;
        this.ocrProcessingService = ocrProcessingService;
        this.voiceProcessingService = voiceProcessingService;
        this.currentUserService = currentUserService;
    }

    public ServiceDraft createManualDraft(ManualServiceDraftRequest request) {
        requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToMockOwner(request.vehicleId());

        ServiceDraft draft = new ServiceDraft();
        draft.setVehicleId(request.vehicleId());
        draft.setOwnerId(currentUserService.getCurrentUserId());
        draft.setInputMethod(InputMethod.MANUAL);
        draft.setServiceDate(request.serviceDate());
        draft.setServiceType(request.serviceType().trim());
        draft.setOdometer(request.odometer());
        draft.setTotalCost(request.totalCost());
        draft.setShopName(blankToNull(request.shopName()));
        draft.setLocation(blankToNull(request.location()));
        draft.setPartsReplaced(blankToNull(request.partsReplaced()));
        draft.setLaborPerformed(blankToNull(request.laborPerformed()));
        draft.setRemarks(blankToNull(request.remarks()));
        draft.setStatus(DraftStatus.DRAFT);
        draft.setFieldMetadata(Map.of("inputMethod", "MANUAL", "source", "owner_entered"));

        return serviceDraftRepository.save(draft);
    }

    public ServiceDraft createReceiptDraft(UUID vehicleId, MultipartFile receiptImage) {
        requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToMockOwner(vehicleId);
        MockReceiptExtraction extraction = ocrProcessingService.extractReceiptFields(receiptImage);

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
        draft.setFieldMetadata(extraction.fieldMetadata());

        return serviceDraftRepository.save(draft);
    }

    public ServiceDraft createVoiceDraft(VoiceServiceDraftRequest request) {
        requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToMockOwner(request.vehicleId());
        MockVoiceExtraction extraction = voiceProcessingService.extractServiceFields(request.transcript());

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
