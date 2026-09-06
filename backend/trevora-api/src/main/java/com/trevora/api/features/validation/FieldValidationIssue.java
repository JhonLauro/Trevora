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
import java.util.Map;

public record FieldValidationIssue(
        String fieldName,
        String label,
        String category,
        String severity,
        String message,
        Object currentValue,
        String source,
        boolean blocksConfirmation,
        boolean requiresReview,

        /**
         * The same sentence, addressed by key so a reader can have it in their
         * own language.
         *
         * <p>{@code message} stays, and stays English: it is what a log, a test
         * assertion and any client that never learned about keys will read. The
         * key is additive, and null wherever a message has not been given one,
         * so the client falls back to the prose rather than showing a blank.
         *
         * <p>{@code messageArgs} carries the values the sentence names -- a
         * date, a total -- because word order is the first thing translation
         * changes, and a sentence assembled server-side in English order cannot
         * be rearranged once it has been concatenated.
         */
        String messageKey,
        Map<String, Object> messageArgs
) {
    /** An issue whose message exists only as English prose. */
    public FieldValidationIssue(
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
        this(fieldName, label, category, severity, message, currentValue, source,
                blocksConfirmation, requiresReview, null, null);
    }
}
