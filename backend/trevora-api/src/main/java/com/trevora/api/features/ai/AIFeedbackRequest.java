package com.trevora.api.features.ai;

import jakarta.validation.constraints.NotNull;

public record AIFeedbackRequest(
        @NotNull(message = "helpful must not be null")
        Boolean helpful,
        String reason,
        String notes
) {
}
