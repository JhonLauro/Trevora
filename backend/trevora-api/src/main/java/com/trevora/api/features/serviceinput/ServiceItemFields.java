package com.trevora.api.features.serviceinput;

import java.math.BigDecimal;
import java.util.List;

/**
 * One extracted/classified service line item, used by OCR/voice AI extraction results
 * before they are persisted as ServiceDraftItem rows. classification is null until the
 * extraction pipeline (OCRProcessingService / VoiceProcessingService) resolves it.
 */
public record ServiceItemFields(
        String serviceType,
        String partsReplaced,
        String laborPerformed,
        BigDecimal lineCost,
        List<ServiceLineEntryFields> lineEntries,
        ServiceClassification classification
) {
    public ServiceItemFields withClassification(ServiceClassification newClassification) {
        return new ServiceItemFields(serviceType, partsReplaced, laborPerformed, lineCost, lineEntries, newClassification);
    }

    public List<ServiceLineEntryFields> lineEntriesOrEmpty() {
        return lineEntries == null ? List.of() : lineEntries;
    }
}
