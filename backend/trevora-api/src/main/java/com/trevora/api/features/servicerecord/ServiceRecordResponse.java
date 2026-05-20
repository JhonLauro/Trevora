package com.trevora.api.features.servicerecord;

import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.servicerecord.ServiceRecord;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

public record ServiceRecordResponse(
        UUID recordId,
        UUID draftId,
        UUID vehicleId,
        UUID ownerId,
        InputMethod sourceInputMethod,
        LocalDate serviceDate,
        String serviceType,
        Integer odometer,
        BigDecimal totalCost,
        String shopName,
        String location,
        String partsReplaced,
        String laborPerformed,
        String remarks,
        Map<String, Object> fieldMetadata,
        Instant createdAt
) {
    public static ServiceRecordResponse from(ServiceRecord record) {
        return new ServiceRecordResponse(
                record.getRecordId(),
                record.getDraftId(),
                record.getVehicleId(),
                record.getOwnerId(),
                record.getSourceInputMethod(),
                record.getServiceDate(),
                record.getServiceType(),
                record.getOdometer(),
                record.getTotalCost(),
                record.getShopName(),
                record.getLocation(),
                record.getPartsReplaced(),
                record.getLaborPerformed(),
                record.getRemarks(),
                record.getFieldMetadata(),
                record.getCreatedAt()
        );
    }
}
