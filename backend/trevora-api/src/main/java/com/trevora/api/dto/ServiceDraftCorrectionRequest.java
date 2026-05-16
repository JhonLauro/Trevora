package com.trevora.api.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import java.math.BigDecimal;
import java.time.LocalDate;

public record ServiceDraftCorrectionRequest(
        LocalDate serviceDate,
        String serviceType,
        @Min(0) Integer odometer,
        @DecimalMin("0.00") BigDecimal totalCost,
        String shopName,
        String location,
        String partsReplaced,
        String laborPerformed,
        String remarks
) {
}
