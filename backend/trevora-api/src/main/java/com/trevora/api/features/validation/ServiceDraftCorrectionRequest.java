package com.trevora.api.features.validation;

import com.trevora.api.features.serviceinput.ServiceItemRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ServiceDraftCorrectionRequest(
        LocalDate serviceDate,
        @Valid List<ServiceItemRequest> services,
        @Min(0) Integer odometer,
        @DecimalMin("0.00") BigDecimal totalCost,
        // What insurance or a warranty absorbed. Null is treated as zero — the
        // review screen only sends it when the owner ticks the coverage
        // toggle, so its absence means "no coverage", not "unknown".
        @DecimalMin("0.00") BigDecimal amountCovered,
        // Who covered it, or null when the owner is not sure. No DISCOUNT: a
        // discount is a lower bill, not coverage (migration 028).
        @Pattern(regexp = "INSURANCE|WARRANTY|GOODWILL|OTHER") String coverageKind,
        String shopName,
        String location,
        String remarks
) {
}
