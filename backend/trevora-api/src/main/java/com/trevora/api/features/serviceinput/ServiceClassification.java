package com.trevora.api.features.serviceinput;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

public record ServiceClassification(
        String normalizedServiceType,
        String serviceCategory,
        List<String> relatedComponents,
        List<String> recordTags,
        String confidence,
        String source,
        List<String> notes,
        boolean needsOwnerReview
) {
    /**
     * The same classification with the category a person chose, marked as
     * theirs.
     *
     * <p>{@code source} becomes MANUAL and {@code needsOwnerReview} false: the
     * owner has just reviewed it, which is the whole point of the flag. The
     * component attribution and notes are left alone - choosing a category says
     * what kind of work it was, not which part of the vehicle it touched.
     */
    public ServiceClassification withOwnerChosenCategory(String category) {
        return new ServiceClassification(
                normalizedServiceType,
                category,
                relatedComponents,
                recordTags,
                "high",
                "MANUAL",
                notes,
                false
        );
    }

    public Map<String, Object> toMetadata() {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("normalizedServiceType", normalizedServiceType);
        // Was "Other". A null category means nothing decided, which is what
        // UNCATEGORIZED says; "Other" would claim a decision was made.
        metadata.put("serviceCategory",
                serviceCategory == null ? ServiceClassificationService.UNCATEGORIZED : serviceCategory);
        metadata.put("relatedComponents", relatedComponents == null ? List.of() : relatedComponents);
        metadata.put("recordTags", recordTags == null ? List.of() : recordTags);
        metadata.put("confidence", confidence == null ? "low" : confidence);
        metadata.put("source", source == null ? "KEYWORD_FALLBACK" : source);
        metadata.put("notes", notes == null ? List.of() : notes);
        metadata.put("needsOwnerReview", needsOwnerReview);
        return metadata;
    }
}
