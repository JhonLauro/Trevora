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
