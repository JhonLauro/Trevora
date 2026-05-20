package com.trevora.api.features.validation;

public record FieldValidationIssue(
        String fieldName,
        String label,
        String category,
        String severity,
        String message,
        Object currentValue,
        Double confidence,
        String source,
        boolean blocksConfirmation,
        boolean requiresReview
) {
}
