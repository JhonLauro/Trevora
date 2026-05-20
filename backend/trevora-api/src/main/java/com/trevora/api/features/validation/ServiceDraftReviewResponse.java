package com.trevora.api.features.validation;


import com.trevora.api.features.serviceinput.ServiceDraftResponse;
public record ServiceDraftReviewResponse(
        ServiceDraftResponse draft,
        ValidationResult validation
) {
}
