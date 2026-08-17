package com.trevora.api.shared.dto;

import com.trevora.api.features.serviceinput.ServiceDraftItem;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import java.math.BigDecimal;
import java.util.Locale;
import java.util.UUID;

/**
 * Shared response shape for a single service line item (one service performed during a visit),
 * used across draft and record response DTOs (serviceinput, servicerecord, history, mechanicaccess).
 */
public record ServiceItemResponse(
        UUID itemId,
        String serviceType,
        String serviceCategory,
        String partsReplaced,
        String laborPerformed,
        BigDecimal lineCost,
        Integer sortOrder
) {
    public static ServiceItemResponse from(ServiceDraftItem item) {
        return new ServiceItemResponse(
                item.getItemId(),
                item.getServiceType(),
                categoryOrFallback(item.getServiceCategory(), item.getServiceType()),
                item.getPartsReplaced(),
                item.getLaborPerformed(),
                item.getLineCost(),
                item.getSortOrder()
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
                item.getSortOrder()
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
