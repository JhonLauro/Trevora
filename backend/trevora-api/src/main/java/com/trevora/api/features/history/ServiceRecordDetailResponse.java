package com.trevora.api.features.history;

import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.servicerecord.ServiceRecord;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

public record ServiceRecordDetailResponse(
        UUID recordId,
        UUID draftId,
        UUID vehicleId,
        UUID ownerId,
        InputMethod sourceInputMethod,
        LocalDate serviceDate,
        String serviceType,
        String category,
        Integer odometer,
        BigDecimal totalCost,
        String shopName,
        String location,
        String partsReplaced,
        String laborPerformed,
        String remarks,
        Map<String, Object> fieldMetadata,
        String receiptStorageBucket,
        String receiptStoragePath,
        String receiptOriginalFilename,
        String receiptContentType,
        Instant createdAt,
        Instant updatedAt
) {
    public static ServiceRecordDetailResponse from(ServiceRecord record, String category) {
        return new ServiceRecordDetailResponse(
                record.getRecordId(),
                record.getDraftId(),
                record.getVehicleId(),
                record.getOwnerId(),
                record.getSourceInputMethod(),
                record.getServiceDate(),
                record.getServiceType(),
                category,
                record.getOdometer(),
                record.getTotalCost(),
                record.getShopName(),
                record.getLocation(),
                record.getPartsReplaced(),
                record.getLaborPerformed(),
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
