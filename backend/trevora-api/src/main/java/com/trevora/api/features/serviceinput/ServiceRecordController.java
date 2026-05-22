package com.trevora.api.features.serviceinput;


import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.serviceinput.ManualServiceDraftRequest;
import com.trevora.api.features.validation.ServiceDraftCorrectionRequest;
import com.trevora.api.features.serviceinput.ServiceDraftResponse;
import com.trevora.api.features.validation.ServiceDraftReviewResponse;
import com.trevora.api.features.servicerecord.ServiceRecordConfirmationResponse;
import com.trevora.api.features.serviceinput.VoiceServiceDraftRequest;
import com.trevora.api.features.serviceinput.VoiceTranscriptionResponse;
import com.trevora.api.features.serviceinput.VoiceTranscriptionService;
import com.trevora.api.features.validation.ServiceDraftCorrectionService;
import com.trevora.api.features.serviceinput.ServiceInputService;
import com.trevora.api.features.servicerecord.ServiceRecordService;
import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/service-drafts")
public class ServiceRecordController {
    private final ServiceInputService serviceInputService;
    private final ServiceDraftCorrectionService serviceDraftCorrectionService;
    private final ServiceRecordService serviceRecordService;
    private final VoiceTranscriptionService voiceTranscriptionService;

    public ServiceRecordController(
            ServiceInputService serviceInputService,
            ServiceDraftCorrectionService serviceDraftCorrectionService,
            ServiceRecordService serviceRecordService,
            VoiceTranscriptionService voiceTranscriptionService
    ) {
        this.serviceInputService = serviceInputService;
        this.serviceDraftCorrectionService = serviceDraftCorrectionService;
        this.serviceRecordService = serviceRecordService;
        this.voiceTranscriptionService = voiceTranscriptionService;
    }

    @PostMapping("/manual")
    @ResponseStatus(HttpStatus.CREATED)
    public ServiceDraftResponse createManualDraft(@Valid @RequestBody ManualServiceDraftRequest request) {
        return ServiceDraftResponse.from(serviceInputService.createManualDraft(request));
    }

    @PostMapping(value = "/receipt", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ServiceDraftResponse createReceiptDraft(
            @RequestParam UUID vehicleId,
            @RequestParam(required = false, name = "receiptImage") MultipartFile receiptImage,
            @RequestParam(required = false, name = "receiptImages") List<MultipartFile> receiptImages,
            @RequestParam(required = false, defaultValue = "UPLOAD") String receiptInputMode,
            @RequestParam(required = false) String receiptStorageBucket,
            @RequestParam(required = false) String receiptStoragePath,
            @RequestParam(required = false) String receiptOriginalFilename,
            @RequestParam(required = false) String receiptContentType,
            @RequestParam(required = false) String receiptPagesJson
    ) {
        List<MultipartFile> files = normalizedReceiptFiles(receiptImage, receiptImages);
        return ServiceDraftResponse.from(serviceInputService.createReceiptDraft(
                vehicleId,
                files,
                receiptInputMode,
                receiptStorageBucket,
                receiptStoragePath,
                receiptOriginalFilename,
                receiptContentType,
                receiptPagesJson
        ));
    }

    @PostMapping("/voice")
    @ResponseStatus(HttpStatus.CREATED)
    public ServiceDraftResponse createVoiceDraft(@Valid @RequestBody VoiceServiceDraftRequest request) {
        return ServiceDraftResponse.from(serviceInputService.createVoiceDraft(request));
    }

    @PostMapping(value = "/voice/transcribe", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public VoiceTranscriptionResponse transcribeVoiceDraft(
            @RequestParam UUID vehicleId,
            @RequestParam("audioFile") MultipartFile audioFile
    ) {
        return voiceTranscriptionService.transcribe(vehicleId, audioFile);
    }

    @GetMapping("/{draftId}")
    public ServiceDraftResponse getDraft(@PathVariable UUID draftId) {
        return ServiceDraftResponse.from(serviceInputService.getDraftForMockOwner(draftId));
    }

    @PatchMapping("/{draftId}/corrections")
    public ServiceDraftReviewResponse correctDraft(
            @PathVariable UUID draftId,
            @Valid @RequestBody ServiceDraftCorrectionRequest request
    ) {
        return serviceDraftCorrectionService.correctDraft(draftId, request);
    }

    @PostMapping("/{draftId}/confirm")
    public ServiceRecordConfirmationResponse confirmDraft(@PathVariable UUID draftId) {
        return serviceRecordService.confirmDraft(draftId);
    }

    private List<MultipartFile> normalizedReceiptFiles(MultipartFile receiptImage, List<MultipartFile> receiptImages) {
        List<MultipartFile> files = new ArrayList<>();
        if (receiptImages != null) {
            files.addAll(receiptImages.stream().filter(file -> file != null && !file.isEmpty()).toList());
        }
        if (files.isEmpty() && receiptImage != null && !receiptImage.isEmpty()) {
            files.add(receiptImage);
        }
        return files;
    }
}
