package com.trevora.api.features.mechanicaccess;

import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.servicerecord.ServiceRecord;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

public record MechanicSharedServiceRecordResponse(
        UUID recordId,
        UUID vehicleId,
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
        String receiptStorageBucket,
        String receiptStoragePath,
        String receiptOriginalFilename,
        String receiptContentType,
        Instant createdAt
) {
    public static MechanicSharedServiceRecordResponse from(ServiceRecord record, String category) {
        return from(record, category, null);
    }

    public static MechanicSharedServiceRecordResponse from(ServiceRecord record, String category, ServiceDraft sourceDraft) {
        return new MechanicSharedServiceRecordResponse(
                record.getRecordId(),
                record.getVehicleId(),
                record.getSourceInputMethod(),
                record.getServiceDate(),
                record.getServiceType(),
                category,
                record.getOdometer(),
                record.getTotalCost(),
                record.getShopName(),
                record.getLocation(),
                record.getPartsReplaced(),
                record.getLaborPerformed(),
                record.getRemarks(),
                preferredMetadata(record, sourceDraft),
                firstPresent(record.getReceiptStorageBucket(), sourceDraft == null ? null : sourceDraft.getReceiptStorageBucket()),
                firstPresent(record.getReceiptStoragePath(), sourceDraft == null ? null : sourceDraft.getReceiptStoragePath()),
                firstPresent(record.getReceiptOriginalFilename(), sourceDraft == null ? null : sourceDraft.getReceiptOriginalFilename()),
                firstPresent(record.getReceiptContentType(), sourceDraft == null ? null : sourceDraft.getReceiptContentType()),
                record.getCreatedAt()
        );
    }

    private static Map<String, Object> preferredMetadata(ServiceRecord record, ServiceDraft sourceDraft) {
        Map<String, Object> recordMetadata = record.getFieldMetadata();
        if (hasStoredReceiptPages(recordMetadata) || sourceDraft == null) {
            return recordMetadata;
        }

        Map<String, Object> draftMetadata = sourceDraft.getFieldMetadata();
        return hasStoredReceiptPages(draftMetadata) ? draftMetadata : recordMetadata;
    }

    private static boolean hasStoredReceiptPages(Map<String, Object> metadata) {
        Object storedPages = metadata == null ? null : metadata.get("storedReceiptPages");
        return storedPages instanceof Iterable<?> pages && pages.iterator().hasNext();
    }

    private static String firstPresent(String primary, String fallback) {
        return primary == null || primary.isBlank() ? fallback : primary;
    }
}
