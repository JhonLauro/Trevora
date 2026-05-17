package com.trevora.api.controller;

import com.trevora.api.dto.AIExplanationResponse;
import com.trevora.api.service.AIExplanationService;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
    public AIExplanationResponse getServiceRecordAIExplanation(@PathVariable UUID recordId) {
        return aiExplanationService.getExplanationForRecord(recordId);
    }
}
