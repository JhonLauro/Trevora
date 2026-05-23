package com.trevora.api.features.history;

import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.servicerecord.ServiceRecord;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public record ServiceRecordDetailResponse(
        UUID recordId,
        UUID draftId,
        UUID vehicleId,
        UUID ownerId,
        InputMethod sourceInputMethod,
        LocalDate serviceDate,
        String serviceType,
        String category,
        Integer odometer,
        BigDecimal totalCost,
        String shopName,
        String location,
        String partsReplaced,
        String laborPerformed,
        String remarks,
        Map<String, Object> fieldMetadata,
        List<String> relatedComponents,
        List<String> recordTags,
        Map<String, Object> classification,
        String receiptStorageBucket,
        String receiptStoragePath,
        String receiptOriginalFilename,
        String receiptContentType,
        Instant createdAt,
        Instant updatedAt
) {
    public static ServiceRecordDetailResponse from(ServiceRecord record, String category) {
        Map<String, Object> classification = classification(record);
        return new ServiceRecordDetailResponse(
                record.getRecordId(),
                record.getDraftId(),
                record.getVehicleId(),
                record.getOwnerId(),
                record.getSourceInputMethod(),
                record.getServiceDate(),
                record.getServiceType(),
                String.valueOf(classification.getOrDefault("serviceCategory", category)),
                record.getOdometer(),
                record.getTotalCost(),
                record.getShopName(),
                record.getLocation(),
                record.getPartsReplaced(),
                record.getLaborPerformed(),
                record.getRemarks(),
                record.getFieldMetadata(),
                stringList(classification.get("relatedComponents")),
                stringList(classification.get("recordTags")),
                classification,
                record.getReceiptStorageBucket(),
                record.getReceiptStoragePath(),
                record.getReceiptOriginalFilename(),
                record.getReceiptContentType(),
                record.getCreatedAt(),
                record.getUpdatedAt()
        );
    }

    private static Map<String, Object> classification(ServiceRecord record) {
        Object node = record.getFieldMetadata() == null ? null : record.getFieldMetadata().get("classification");
        if (node instanceof Map<?, ?> map) {
            Map<String, Object> values = new LinkedHashMap<>();
            map.forEach((key, value) -> values.put(String.valueOf(key), value));
            return values;
        }
        return Map.of();
    }

    private static List<String> stringList(Object node) {
        if (node instanceof List<?> list) {
            return list.stream().filter(value -> value != null && !String.valueOf(value).isBlank()).map(String::valueOf).toList();
        }
        return List.of();
    }
}
