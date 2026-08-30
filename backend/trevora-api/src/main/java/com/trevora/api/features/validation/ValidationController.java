package com.trevora.api.features.validation;

import com.trevora.api.features.validation.ServiceDraftReviewResponse;
import com.trevora.api.features.validation.ValidationResult;
import com.trevora.api.features.validation.ServiceDraftValidationService;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/service-drafts/{draftId}")
public class ValidationController {
    private final ServiceDraftValidationService serviceDraftValidationService;

    public ValidationController(ServiceDraftValidationService serviceDraftValidationService) {
        this.serviceDraftValidationService = serviceDraftValidationService;
    }

    @GetMapping("/review")
    public ServiceDraftReviewResponse getDraftReview(@PathVariable UUID draftId) {
        return serviceDraftValidationService.getDraftReview(draftId);
    }

    @PostMapping("/validate")
    public ValidationResult validateDraft(@PathVariable UUID draftId) {
        return serviceDraftValidationService.validateDraftForCurrentUser(draftId);
    }
}
