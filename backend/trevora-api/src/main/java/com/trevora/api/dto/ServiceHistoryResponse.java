package com.trevora.api.dto;

import java.util.List;
import java.util.UUID;

public record ServiceHistoryResponse(
        UUID vehicleId,
        String sort,
        String serviceType,
        String keyword,
        int totalRecords,
        List<String> serviceTypes,
        List<ServiceRecordSummaryResponse> records
) {
}
