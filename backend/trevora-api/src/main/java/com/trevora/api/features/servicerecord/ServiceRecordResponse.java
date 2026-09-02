package com.trevora.api.features.servicerecord;

import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.shared.dto.ServiceItemResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record ServiceRecordResponse(
        UUID recordId,
        UUID draftId,
        UUID vehicleId,
        UUID ownerId,
        InputMethod sourceInputMethod,
        /**
         * The kind of document behind this record, and the numbers on it. A
         * record confirmed from an estimate holds a quoted total and has to be
         * able to say so; documentNumber is the reference an owner quotes to
         * the shop that did the work, which reaches everything that shop
         * recorded and this record never held.
         */
        com.trevora.api.features.serviceinput.DocumentType documentType,
        String documentNumber,
        List<String> referenceNumbers,
        LocalDate serviceDate,
        List<ServiceItemResponse> services,
        Integer odometer,
        BigDecimal totalCost,
        String shopName,
        String location,
        String remarks,
        Map<String, Object> fieldMetadata,
        String receiptStorageBucket,
        String receiptStoragePath,
        String receiptOriginalFilename,
        String receiptContentType,
        Instant createdAt
) {
    public static ServiceRecordResponse from(ServiceRecord record, List<ServiceRecordItem> items) {
        return new ServiceRecordResponse(
                record.getRecordId(),
                record.getDraftId(),
                record.getVehicleId(),
                record.getOwnerId(),
                record.getSourceInputMethod(),
                record.getDocumentType(),
                record.getDocumentNumber(),
                record.getReferenceNumbers(),
                record.getServiceDate(),
                items == null ? List.of() : items.stream().map(ServiceItemResponse::from).toList(),
                record.getOdometer(),
                record.getTotalCost(),
                record.getShopName(),
                record.getLocation(),
                record.getRemarks(),
                record.getFieldMetadata(),
                record.getReceiptStorageBucket(),
                record.getReceiptStoragePath(),
                record.getReceiptOriginalFilename(),
                record.getReceiptContentType(),
                record.getCreatedAt()
        );
    }
}
