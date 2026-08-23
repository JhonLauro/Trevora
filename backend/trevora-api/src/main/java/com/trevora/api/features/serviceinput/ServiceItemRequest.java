package com.trevora.api.features.serviceinput;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.util.List;

/**
 * One service the owner is claiming happened during a visit.
 *
 * <p>{@code partsReplaced} and {@code laborPerformed} are the pre-011 free-text
 * buckets, kept while the review and correction screens still post them.
 * {@code lineEntries} is the replacement: the receipt line by line, each tagged
 * with whether it is an operation, a part, a material or a fee. A client that
 * sends line entries does not need the two text fields.
 */
public record ServiceItemRequest(
        @NotBlank String serviceType,
        String partsReplaced,
        String laborPerformed,
        @DecimalMin("0.00") BigDecimal lineCost,
        @Valid List<ServiceLineEntryRequest> lineEntries
) {
    public List<ServiceLineEntryRequest> lineEntriesOrEmpty() {
        return lineEntries == null ? List.of() : lineEntries;
    }
}
