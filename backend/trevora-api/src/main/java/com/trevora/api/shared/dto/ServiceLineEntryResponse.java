package com.trevora.api.shared.dto;

import com.trevora.api.features.serviceinput.ServiceDraftLineEntry;
import com.trevora.api.features.serviceinput.ServiceLineKind;
import com.trevora.api.features.servicerecord.ServiceRecordLineEntry;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * Shared response shape for one printed line of a receipt, nested under the
 * service item it belongs to. Used across draft and record responses, the same
 * way {@link ServiceItemResponse} is.
 *
 * <p>{@code kind} is the field the rest of the product reads. It is what lets a
 * screen show "3 parts, 11 materials" instead of fourteen indistinguishable
 * strings, and what stops a tin of thinner being counted as a serviced
 * component.
 */
public record ServiceLineEntryResponse(
        UUID entryId,
        ServiceLineKind kind,
        String description,
        String partCode,
        BigDecimal quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal,
        Integer sortOrder
) {
    public static ServiceLineEntryResponse from(ServiceDraftLineEntry entry) {
        return new ServiceLineEntryResponse(
                entry.getEntryId(),
                entry.getKind(),
                entry.getDescription(),
                entry.getPartCode(),
                entry.getQuantity(),
                entry.getUnitPrice(),
                entry.getLineTotal(),
                entry.getSortOrder()
        );
    }

    public static ServiceLineEntryResponse from(ServiceRecordLineEntry entry) {
        return new ServiceLineEntryResponse(
                entry.getEntryId(),
                entry.getKind(),
                entry.getDescription(),
                entry.getPartCode(),
                entry.getQuantity(),
                entry.getUnitPrice(),
                entry.getLineTotal(),
                entry.getSortOrder()
        );
    }
}
