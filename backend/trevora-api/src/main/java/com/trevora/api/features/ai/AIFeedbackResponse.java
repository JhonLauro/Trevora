package com.trevora.api.features.ai;

import java.time.Instant;
import java.util.UUID;

public record AIFeedbackResponse(
        UUID feedbackId,
        UUID recordId,
        boolean helpful,
        String reason,
        String notes,
        Instant updatedAt
) {
    public static AIFeedbackResponse from(ServiceRecordAIFeedback feedback) {
        if (feedback == null) {
            return null;
        }
        return new AIFeedbackResponse(
                feedback.getFeedbackId(),
                feedback.getRecordId(),
                feedback.isHelpful(),
                feedback.getReason(),
                feedback.getNotes(),
                feedback.getUpdatedAt()
        );
    }
}
