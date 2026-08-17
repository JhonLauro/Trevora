package com.trevora.api.features.serviceinput;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record ManualServiceDraftRequest(
        @NotNull UUID vehicleId,
        @NotNull LocalDate serviceDate,
        @NotEmpty @Valid List<ServiceItemRequest> services,
        @Min(0) Integer odometer,
        @NotNull @DecimalMin("0.00") BigDecimal totalCost,
        String shopName,
        String location,
        String remarks
) {
}
