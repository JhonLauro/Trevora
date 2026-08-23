package com.trevora.api.features.serviceinput;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;

/**
 * One receipt line as submitted by the owner — manual entry, or the correction
 * pass over an extracted draft.
 *
 * <p>{@code kind} is a plain String rather than the enum so an unrecognised
 * value is a conservative default rather than a 400. See
 * {@link ServiceLineKind#fromNullable}.
 */
public record ServiceLineEntryRequest(
        String kind,
        @NotBlank String description,
        String partCode,
        @DecimalMin("0.000") BigDecimal quantity,
        @DecimalMin("0.00") BigDecimal unitPrice,
        @DecimalMin("0.00") BigDecimal lineTotal
) {
}
