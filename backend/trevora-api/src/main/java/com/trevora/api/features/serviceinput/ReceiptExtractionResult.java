package com.trevora.api.features.serviceinput;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record ReceiptExtractionResult(
        DocumentType documentType,
        String documentNumber,
        List<String> referenceNumbers,
        LocalDate serviceDate,
        List<ServiceItemFields> services,
        Integer odometer,
        BigDecimal totalCost,
        String shopName,
        String location,
        String remarks,
        Map<String, Object> fieldMetadata,
        // What insurance, a warranty or goodwill covered, when the receipt's
        // totals box proved it. Null when nothing was proven, which leaves the
        // draft's default of nothing covered.
        BigDecimal amountCovered,
        // Which kind the credit rows named (INSURANCE, WARRANTY or GOODWILL).
        // Null when they did not agree, or when nothing was covered.
        String coverageKind
) {
    /** For the paths that never read a totals box, and so never a kind. */
    public ReceiptExtractionResult(
            DocumentType documentType,
            String documentNumber,
            List<String> referenceNumbers,
            LocalDate serviceDate,
            List<ServiceItemFields> services,
            Integer odometer,
            BigDecimal totalCost,
            String shopName,
            String location,
            String remarks,
            Map<String, Object> fieldMetadata,
            BigDecimal amountCovered
    ) {
        this(documentType, documentNumber, referenceNumbers, serviceDate, services, odometer, totalCost,
                shopName, location, remarks, fieldMetadata, amountCovered, null);
    }
}
