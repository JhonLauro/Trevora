package com.trevora.api.features.validation;

import com.trevora.api.features.serviceinput.ServiceItemRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ServiceDraftCorrectionRequest(
        LocalDate serviceDate,
        @Valid List<ServiceItemRequest> services,
        @Min(0) Integer odometer,
        @DecimalMin("0.00") BigDecimal totalCost,
        String shopName,
        String location,
        String remarks
) {
}
