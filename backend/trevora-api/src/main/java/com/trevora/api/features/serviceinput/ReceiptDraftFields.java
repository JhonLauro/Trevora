package com.trevora.api.features.serviceinput;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record ReceiptDraftFields(
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
        List<String> confidenceNotes,
        Map<String, Object> fieldSources,
        Map<String, String> fieldConfidence,
        List<String> aiSuggestedFields,
        ServiceClassification classification,
        List<String> warnings,
        /*
         * The vehicle's own identifiers, when the paper printed them.
         *
         * Appended rather than slotted next to the other factual fields: this
         * record is built positionally in four places, and inserting into the
         * middle of a sixteen-component list is how a shop name ends up in a
         * location column. They are last because they are the newest, not
         * because they matter least.
         *
         * Nothing is filed under these. They exist so the app can notice a
         * receipt naming a plate or chassis the owner has never recorded, and
         * offer to fill it in.
         */
        String plateNumber,
        String vinChassisNumber,
        /*
         * The manufacturer warranty period, when the paper labels one ("Wty
         * Date", "Wty Exp Date"). Offered to the owner on the Saved page, never
         * written to the vehicle on their behalf. A Delivery Date is never the
         * start: dealer stock and demo units are delivered long before a
         * customer buys them, and cover starts at the sale.
         */
        LocalDate warrantyStartDate,
        LocalDate warrantyExpiryDate
) {
    /** For callers that predate the warranty dates, and so read none. */
    public ReceiptDraftFields(
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
            List<String> confidenceNotes,
            Map<String, Object> fieldSources,
            Map<String, String> fieldConfidence,
            List<String> aiSuggestedFields,
            ServiceClassification classification,
            List<String> warnings,
            String plateNumber,
            String vinChassisNumber
    ) {
        this(documentType, documentNumber, referenceNumbers, serviceDate, services, odometer, totalCost,
                shopName, location, remarks, confidenceNotes, fieldSources, fieldConfidence,
                aiSuggestedFields, classification, warnings, plateNumber, vinChassisNumber, null, null);
    }
}
