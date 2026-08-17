package com.trevora.api.features.history;

import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import com.trevora.api.shared.dto.ServiceItemResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record ServiceRecordSummaryResponse(
        UUID recordId,
        UUID draftId,
        UUID vehicleId,
        InputMethod sourceInputMethod,
        LocalDate serviceDate,
        List<ServiceItemResponse> services,
        Integer odometer,
        BigDecimal totalCost,
        String shopName,
        Instant createdAt
) {
    public static ServiceRecordSummaryResponse from(ServiceRecord record, List<ServiceRecordItem> items) {
        return new ServiceRecordSummaryResponse(
                record.getRecordId(),
                record.getDraftId(),
                record.getVehicleId(),
                record.getSourceInputMethod(),
                record.getServiceDate(),
                items == null ? List.of() : items.stream().map(ServiceItemResponse::from).toList(),
                record.getOdometer(),
                record.getTotalCost(),
                record.getShopName(),
                record.getCreatedAt()
        );
    }
}
