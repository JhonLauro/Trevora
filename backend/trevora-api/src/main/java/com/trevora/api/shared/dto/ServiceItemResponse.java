package com.trevora.api.shared.dto;

import com.trevora.api.features.serviceinput.ServiceClassificationService;
import com.trevora.api.features.serviceinput.ServiceDraftItem;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Shared response shape for a single service line item (one service performed during a visit),
 * used across draft and record response DTOs (serviceinput, servicerecord, history, mechanicaccess).
 *
 * <p>{@code partsReplaced} and {@code laborPerformed} are the pre-011 free-text
 * buckets and are on their way out. {@code lineEntries} is what replaces them:
 * the receipt line by line, each tagged with what it actually is. Read
 * {@code lineEntries} for anything that has to distinguish a fitted part from a
 * consumed material — the two text fields cannot, which is the bug that
 * produced this table.
 */
public record ServiceItemResponse(
        UUID itemId,
        String serviceType,
        String serviceCategory,
        String partsReplaced,
        String laborPerformed,
        BigDecimal lineCost,
        Integer sortOrder,
        List<ServiceLineEntryResponse> lineEntries
) {
    public static ServiceItemResponse from(ServiceDraftItem item) {
        return new ServiceItemResponse(
                item.getItemId(),
                item.getServiceType(),
                categoryOrFallback(item.getServiceCategory(), item.getServiceType()),
                item.getPartsReplaced(),
                item.getLaborPerformed(),
                item.getLineCost(),
                item.getSortOrder(),
                item.getLineEntries().stream().map(ServiceLineEntryResponse::from).toList()
        );
    }

    public static ServiceItemResponse from(ServiceRecordItem item) {
        return new ServiceItemResponse(
                item.getItemId(),
                item.getServiceType(),
                categoryOrFallback(item.getServiceCategory(), item.getServiceType()),
                item.getPartsReplaced(),
                item.getLaborPerformed(),
                item.getLineCost(),
                item.getSortOrder(),
                item.getLineEntries().stream().map(ServiceLineEntryResponse::from).toList()
        );
    }

    /**
     * Legacy rows backfilled by 007_service_line_items have no
     * {@code service_category}, and this used to guess one from keywords.
     *
     * <p>It no longer guesses. A fourth keyword table living in a DTO was one of
     * the four disagreeing definitions of this field, and its answers were
     * indistinguishable on screen from a category something had actually
     * decided - an old row reading "Maintenance" looked exactly like a
     * classified one. Saying UNCATEGORIZED is the honest answer for a row where
     * nothing ever ran, and it is the only answer that lets a screen offer to
     * fix it.
     */
    private static String categoryOrFallback(String serviceCategory, String serviceType) {
        if (serviceCategory != null && !serviceCategory.isBlank()) {
            return serviceCategory;
        }
        return ServiceClassificationService.UNCATEGORIZED;
    }
}
