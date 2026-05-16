package com.trevora.api.dto;

import java.util.List;
import java.util.UUID;

public record ValidationResult(
        UUID draftId,
        boolean valid,
        List<FieldValidationIssue> missingRequiredFields,
        List<FieldValidationIssue> flaggedFields,
        List<String> reviewSummary
) {
}
