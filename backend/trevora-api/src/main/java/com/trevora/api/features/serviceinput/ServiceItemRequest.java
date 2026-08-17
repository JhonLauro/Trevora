package com.trevora.api.features.serviceinput;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;

public record ServiceItemRequest(
        @NotBlank String serviceType,
        String partsReplaced,
        String laborPerformed,
        @DecimalMin("0.00") BigDecimal lineCost
) {
}
