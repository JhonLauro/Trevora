package com.trevora.api.features.history;

import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ValidationStatus;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import com.trevora.api.shared.dto.ServiceItemResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record ServiceRecordDetailResponse(
        UUID recordId,
        UUID draftId,
        UUID vehicleId,
        UUID ownerId,
        InputMethod sourceInputMethod,
        ValidationStatus validationStatus,
        /**
         * The kind of document this record came off, and the numbers on it.
         * This is the screen a mechanic is shown at handoff, so it is the one
         * place documentNumber matters most: it is the reference that reaches
         * the servicing shop's own record of the visit.
         */
        com.trevora.api.features.serviceinput.DocumentType documentType,
        String documentNumber,
        List<String> referenceNumbers,
        LocalDate serviceDate,
        List<ServiceItemResponse> services,
        Integer odometer,
        BigDecimal totalCost,
        BigDecimal amountCovered,
        BigDecimal ownerPaid,
        String shopName,
        String location,
        String remarks,
        Map<String, Object> fieldMetadata,
        String receiptStorageBucket,
        String receiptStoragePath,
        String receiptOriginalFilename,
        String receiptContentType,
        Instant createdAt,
        Instant updatedAt
) {
    public static ServiceRecordDetailResponse from(ServiceRecord record, List<ServiceRecordItem> items) {
        return new ServiceRecordDetailResponse(
                record.getRecordId(),
                record.getDraftId(),
                record.getVehicleId(),
                record.getOwnerId(),
                record.getSourceInputMethod(),
                record.getValidationStatus(),
                record.getDocumentType(),
                record.getDocumentNumber(),
                record.getReferenceNumbers(),
                record.getServiceDate(),
                items == null ? List.of() : items.stream().map(ServiceItemResponse::from).toList(),
                record.getOdometer(),
                record.getTotalCost(),
                record.getAmountCovered(),
                record.getOwnerPaid(),
                record.getShopName(),
                record.getLocation(),
                record.getRemarks(),
                record.getFieldMetadata(),
                record.getReceiptStorageBucket(),
                record.getReceiptStoragePath(),
                record.getReceiptOriginalFilename(),
                record.getReceiptContentType(),
                record.getCreatedAt(),
                record.getUpdatedAt()
        );
    }
}
