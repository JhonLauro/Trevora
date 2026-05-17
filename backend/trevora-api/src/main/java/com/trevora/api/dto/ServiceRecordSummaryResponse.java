package com.trevora.api.dto;

import com.trevora.api.enums.InputMethod;
import com.trevora.api.model.ServiceRecord;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ServiceRecordSummaryResponse(
        UUID recordId,
        UUID draftId,
        UUID vehicleId,
        InputMethod sourceInputMethod,
        LocalDate serviceDate,
        String serviceType,
        String category,
        Integer odometer,
        BigDecimal totalCost,
        String shopName,
        String partsReplaced,
        String laborPerformed,
        Instant createdAt
) {
    public static ServiceRecordSummaryResponse from(ServiceRecord record, String category) {
        return new ServiceRecordSummaryResponse(
                record.getRecordId(),
                record.getDraftId(),
                record.getVehicleId(),
                record.getSourceInputMethod(),
                record.getServiceDate(),
                record.getServiceType(),
                category,
                record.getOdometer(),
                record.getTotalCost(),
                record.getShopName(),
                record.getPartsReplaced(),
                record.getLaborPerformed(),
                record.getCreatedAt()
        );
    }
}
