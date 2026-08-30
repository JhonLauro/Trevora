package com.trevora.api.features.mechanicaccess;

import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import com.trevora.api.features.servicerecord.ValidationStatus;
import com.trevora.api.shared.dto.ServiceItemResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record MechanicSharedServiceRecordResponse(
        UUID recordId,
        UUID vehicleId,
        InputMethod sourceInputMethod,
        LocalDate serviceDate,
        List<ServiceItemResponse> services,
        // Whether a human is accountable for these fields. The mechanic is the
        // reader with the most at stake in that question — they act on this
        // data — and until now they were the one reader not told. The page
        // filled the silence by labelling every shared record "Validated".
        ValidationStatus validationStatus,
        Integer odometer,
        BigDecimal totalCost,
        String shopName,
        String location,
        String remarks,
        Map<String, Object> fieldMetadata,
        String receiptStorageBucket,
        String receiptStoragePath,
        String receiptOriginalFilename,
        String receiptContentType,
        Instant createdAt
) {
    public static MechanicSharedServiceRecordResponse from(ServiceRecord record, List<ServiceRecordItem> items) {
        return from(record, items, null);
    }

    public static MechanicSharedServiceRecordResponse from(ServiceRecord record, List<ServiceRecordItem> items, ServiceDraft sourceDraft) {
        return new MechanicSharedServiceRecordResponse(
                record.getRecordId(),
                record.getVehicleId(),
                record.getSourceInputMethod(),
                record.getServiceDate(),
                items == null ? List.of() : items.stream().map(ServiceItemResponse::from).toList(),
                record.getValidationStatus(),
                record.getOdometer(),
                record.getTotalCost(),
                record.getShopName(),
                record.getLocation(),
                record.getRemarks(),
                mechanicSafeMetadata(preferredMetadata(record, sourceDraft)),
                firstPresent(record.getReceiptStorageBucket(), sourceDraft == null ? null : sourceDraft.getReceiptStorageBucket()),
                firstPresent(record.getReceiptStoragePath(), sourceDraft == null ? null : sourceDraft.getReceiptStoragePath()),
                firstPresent(record.getReceiptOriginalFilename(), sourceDraft == null ? null : sourceDraft.getReceiptOriginalFilename()),
                firstPresent(record.getReceiptContentType(), sourceDraft == null ? null : sourceDraft.getReceiptContentType()),
                record.getCreatedAt()
        );
    }

    /*
     * The mechanic's copy of fieldMetadata, reduced to what their screens
     * actually render.
     *
     * The full map is an extraction diary. Among other things it carries
     * `rawOcrText` and, per page, `rawText` -- the entire OCR transcript of
     * the receipt. A garage invoice routinely prints the owner's full name,
     * home address, phone number and VIN alongside the work done, so shipping
     * that transcript hands a temporary visitor a machine-readable copy of
     * personal details the UI never shows and the job never needs.
     *
     * The receipt image itself is still shared, deliberately -- a mechanic
     * checking what was actually billed is the point of this feature. The
     * difference is that an image is read by a person looking at one record,
     * while a JSON transcript is harvested from all of them in a loop.
     *
     * Also dropped: ocrProvider, aiProvider, aiModel, fieldSources, textLength
     * and errorMessage. None are rendered, and naming our extraction stack and
     * its failures to an untrusted reader is free reconnaissance.
     *
     * Whitelist rather than blacklist on purpose. A new key added upstream
     * should arrive here unsent by default; the alternative leaks by omission
     * the first time somebody records something new.
     */
    private static final List<String> MECHANIC_SAFE_PAGE_KEYS = List.of("pageNumber", "bucket", "path");

    @SuppressWarnings("unchecked")
    private static Map<String, Object> mechanicSafeMetadata(Map<String, Object> metadata) {
        if (metadata == null) {
            return null;
        }

        Map<String, Object> safe = new LinkedHashMap<>();

        // Drives the "Repair / Engine / Cooling System" chips on the detail page.
        Object classification = metadata.get("classification");
        if (classification != null) {
            safe.put("classification", classification);
        }

        // Only the pointers the receipt viewer needs to fetch each image.
        if (metadata.get("storedReceiptPages") instanceof Iterable<?> pages) {
            List<Map<String, Object>> trimmed = new ArrayList<>();
            for (Object page : pages) {
                if (!(page instanceof Map<?, ?> raw)) {
                    continue;
                }
                Map<String, Object> source = (Map<String, Object>) raw;
                Map<String, Object> kept = new LinkedHashMap<>();
                for (String key : MECHANIC_SAFE_PAGE_KEYS) {
                    Object value = source.get(key);
                    if (value != null) {
                        kept.put(key, value);
                    }
                }
                // A page with no path cannot be displayed, so it is only weight.
                if (kept.get("path") != null) {
                    trimmed.add(kept);
                }
            }
            if (!trimmed.isEmpty()) {
                safe.put("storedReceiptPages", trimmed);
            }
        }

        return safe.isEmpty() ? null : safe;
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
