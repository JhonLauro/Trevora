package com.trevora.api.shared.dto;

import com.trevora.api.features.serviceinput.ServiceDraftItem;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
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

    // Fallback keyword-based categorization for legacy rows backfilled by the
    // 007_service_line_items migration, which do not have service_category set.
    private static String categoryOrFallback(String serviceCategory, String serviceType) {
        if (serviceCategory != null && !serviceCategory.isBlank()) {
            return serviceCategory;
        }
        String value = serviceType == null ? "" : serviceType.toLowerCase(Locale.ROOT);
        if (value.contains("oil") || value.contains("filter") || value.contains("tire") || value.contains("tyre")) {
            return "Maintenance";
        }
        if (value.contains("brake") || value.contains("battery") || value.contains("repair") || value.contains("replace")) {
            return "Repair";
        }
        if (value.contains("inspect") || value.contains("diagnostic") || value.contains("check")) {
            return "Inspection";
        }
        return "Other";
    }
}
