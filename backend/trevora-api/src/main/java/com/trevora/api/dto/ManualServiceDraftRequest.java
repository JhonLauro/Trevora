package com.trevora.api.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ManualServiceDraftRequest(
        @NotNull UUID vehicleId,
        @NotNull LocalDate serviceDate,
        @NotBlank String serviceType,
        @Min(0) Integer odometer,
        @NotNull @DecimalMin("0.00") BigDecimal totalCost,
        String shopName,
        String location,
        String partsReplaced,
        String laborPerformed,
        String remarks
) {
}
