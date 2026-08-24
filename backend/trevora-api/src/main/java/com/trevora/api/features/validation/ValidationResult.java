package com.trevora.api.features.validation;

import java.util.List;
import java.util.UUID;

/**
 * Everything validation has to say about one draft.
 *
 * <p>{@code missingRequiredFields} and {@code invalidFields} were one list.
 * That put "service date is in the future" under a heading reading "missing
 * required fields", about a date that was present - and the two need different
 * words and different fixes: one is "fill this in", the other is "this says
 * something that cannot be true".
 *
 * <p>{@code flaggedFields} is warnings only. An issue that blocks confirmation
 * appears in {@code invalidFields} and nowhere else, so nothing counts it
 * twice.
 */
public record ValidationResult(
        UUID draftId,
        boolean valid,
        List<FieldValidationIssue> missingRequiredFields,
        List<FieldValidationIssue> invalidFields,
        List<FieldValidationIssue> flaggedFields,
        List<String> reviewSummary
) {
}
