package com.trevora.api.features.serviceinput;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * One service the owner is claiming happened during a visit.
 *
 * <p>{@code partsReplaced} and {@code laborPerformed} are the pre-011 free-text
 * buckets, kept while the review screen still posts them. {@code lineEntries}
 * is the replacement: the receipt line by line, each tagged with whether it is
 * an operation, a part, a material or a fee. A client that sends line entries
 * does not need the two text fields.
 *
 * <p><b>Null and empty mean different things for {@code lineEntries}, and the
 * difference is data.</b> Saving a correction rebuilds a draft's items from
 * this request, so:
 *
 * <ul>
 *   <li><b>null</b> — leave the item's existing lines alone. This is a PATCH,
 *       and an absent field means unchanged. A client that knows nothing about
 *       line entries cannot destroy them by not mentioning them.
 *   <li><b>empty list</b> — the item has no lines. Deliberate, and the way to
 *       clear them.
 *   <li><b>a list</b> — these are the lines, replacing whatever was there.
 * </ul>
 *
 * <p>Carrying the existing lines forward needs {@code itemId} to know which
 * item's lines to keep. Omit it on a newly added service; there is nothing to
 * carry.
 */
public record ServiceItemRequest(
        UUID itemId,
        @NotBlank String serviceType,
        String partsReplaced,
        String laborPerformed,
        @DecimalMin("0.00") BigDecimal lineCost,
        @Valid List<ServiceLineEntryRequest> lineEntries
) {
    public List<ServiceLineEntryRequest> lineEntriesOrEmpty() {
        return lineEntries == null ? List.of() : lineEntries;
    }

    /** Whether this request says anything at all about the item's lines. */
    public boolean specifiesLineEntries() {
        return lineEntries != null;
    }
}
