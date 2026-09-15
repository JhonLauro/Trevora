package com.trevora.api.features.ai;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/service-records")
public class AIController {
    private final AIExplanationService aiExplanationService;

    public AIController(AIExplanationService aiExplanationService) {
        this.aiExplanationService = aiExplanationService;
    }

    @GetMapping("/{recordId}/ai-explanation")
    public AIExplanationResponse getServiceRecordAIExplanation(
            @PathVariable UUID recordId,
            /* Optional, and English when absent: an older client, or a direct
               call, should still get a readable answer rather than a 400. */
            @RequestParam(name = "lang", required = false, defaultValue = "en") String lang
    ) {
        return aiExplanationService.getExplanationForRecord(recordId, lang);
    }

    @PostMapping("/{recordId}/ai-explanation/feedback")
    public AIFeedbackResponse submitAIExplanationFeedback(
            @PathVariable UUID recordId,
            @Valid @RequestBody AIFeedbackRequest request,
            @RequestParam(name = "lang", required = false, defaultValue = "en") String lang
    ) {
        return aiExplanationService.submitFeedback(recordId, request, lang);
    }
}
