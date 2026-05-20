package com.trevora.api.features.mechanicaccess;

import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.servicerecord.ServiceRecord;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record MechanicSharedServiceRecordResponse(
        UUID recordId,
        UUID vehicleId,
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
        Instant createdAt
) {
    public static MechanicSharedServiceRecordResponse from(ServiceRecord record, String category) {
        return new MechanicSharedServiceRecordResponse(
                record.getRecordId(),
                record.getVehicleId(),
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
                record.getCreatedAt()
        );
    }
}
