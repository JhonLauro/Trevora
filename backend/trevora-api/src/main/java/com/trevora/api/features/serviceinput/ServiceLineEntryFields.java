package com.trevora.api.features.serviceinput;

import java.math.BigDecimal;

/**
 * One receipt line as extracted from OCR or a voice note, before it is
 * persisted as a {@link ServiceDraftLineEntry}.
 *
 * <p>Separate from {@link ServiceLineEntryRequest} for the same reason
 * {@link ServiceItemFields} is separate from {@link ServiceItemRequest}: what a
 * model produced and what an owner submitted are different claims, and only one
 * of them has a human behind it.
 */
public record ServiceLineEntryFields(
        String kind,
        String description,
        String partCode,
        BigDecimal quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal
) {
}
