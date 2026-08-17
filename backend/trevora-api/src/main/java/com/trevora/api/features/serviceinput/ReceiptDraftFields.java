package com.trevora.api.features.serviceinput;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record ReceiptDraftFields(
        LocalDate serviceDate,
        List<ServiceItemFields> services,
        Integer odometer,
        BigDecimal totalCost,
        String shopName,
        String location,
        String remarks,
        List<String> confidenceNotes,
        Map<String, Object> fieldSources,
        Map<String, String> fieldConfidence,
        List<String> aiSuggestedFields,
        ServiceClassification classification,
        List<String> warnings
) {
}
