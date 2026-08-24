package com.trevora.api.features.validation;

/**
 * One thing wrong, or worth a second look, about one field.
 *
 * <p>There is no numeric confidence here. Extraction reports confidence
 * categorically - high, medium, low, not_found - and the only thing that ever
 * wrote a number was the mock provider that has since been removed. The field
 * survived it, always null, and the review screen bucketed on it: {@code
 * Number(null)} is 0, which is finite, so every informational field fell past
 * the high and medium tests and was counted as low confidence. A summary bar
 * meant to say how much of the receipt was read cleanly reported zero high and
 * zero medium on every receipt. Categories carry the meaning now.
 */
public record FieldValidationIssue(
        String fieldName,
        String label,
        String category,
        String severity,
        String message,
        Object currentValue,
        String source,
        boolean blocksConfirmation,
        boolean requiresReview
) {
}
