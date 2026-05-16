package com.trevora.api.controller;

import com.trevora.api.dto.ManualServiceDraftRequest;
import com.trevora.api.dto.ServiceDraftResponse;
import com.trevora.api.dto.VoiceServiceDraftRequest;
import com.trevora.api.service.ServiceInputService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

    public ServiceRecordController(ServiceInputService serviceInputService) {
        this.serviceInputService = serviceInputService;
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
            @RequestParam("receiptImage") MultipartFile receiptImage
    ) {
        return ServiceDraftResponse.from(serviceInputService.createReceiptDraft(vehicleId, receiptImage));
    }

    @PostMapping("/voice")
    @ResponseStatus(HttpStatus.CREATED)
    public ServiceDraftResponse createVoiceDraft(@Valid @RequestBody VoiceServiceDraftRequest request) {
        return ServiceDraftResponse.from(serviceInputService.createVoiceDraft(request));
    }

    @GetMapping("/{draftId}")
    public ServiceDraftResponse getDraft(@PathVariable UUID draftId) {
        return ServiceDraftResponse.from(serviceInputService.getDraftForMockOwner(draftId));
    }
}
