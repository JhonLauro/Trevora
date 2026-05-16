package com.trevora.api.dto;

public record ServiceDraftReviewResponse(
        ServiceDraftResponse draft,
        ValidationResult validation
) {
}
