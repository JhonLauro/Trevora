package com.trevora.api.features.mechanicaccess;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.trevora.api.features.servicerecord.ServiceRecord;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A mechanic holds a temporary, owner-approved, read-only link. What reaches
 * them should be the service history and nothing else.
 *
 * <p>`fieldMetadata` is an extraction diary rather than a display model: it
 * carries `rawOcrText` and a per-page `rawText`, which together are the entire
 * optical-character transcript of the receipt. Garage invoices print the
 * owner's name, home address, phone number and VIN next to the work done, so
 * sending that transcript hands a visitor a machine-readable copy of personal
 * details no screen shows and no repair needs.
 *
 * <p>These tests pin the whitelist. If someone widens it back to the full map,
 * or adds a key upstream that quietly rides along, this fails.
 */
class MechanicMetadataMinimisationTest {

    private ServiceRecord recordWithMetadata() {
        Map<String, Object> page = new LinkedHashMap<>();
        page.put("pageNumber", 1);
        page.put("bucket", "service-receipts");
        page.put("path", "owner/vehicle/page-1.jpg");
        page.put("originalFilename", "juan-dela-cruz-invoice.jpg");
        page.put("rawText", "CANYON CREEK TOYOTA\nJUAN DELA CRUZ\n21 Mabini St, Cebu City\n0917 555 0134\nVIN JTDBR32E030088888");
        page.put("ocrStatus", "SUCCESS");
        page.put("textLength", 118);

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("storedReceiptPages", List.of(page));
        metadata.put("classification", Map.of("serviceCategory", "Engine"));
        metadata.put("rawOcrText", "JUAN DELA CRUZ  21 Mabini St, Cebu City  0917 555 0134");
        metadata.put("ocrProvider", "google-vision");
        metadata.put("aiProvider", "openai");
        metadata.put("aiModel", "gpt-4o");
        metadata.put("fieldSources", Map.of("odometer", "receipt"));
        metadata.put("errorMessage", "Google Cloud Vision OCR returned empty text.");

        ServiceRecord record = new ServiceRecord();
        record.setFieldMetadata(metadata);
        return record;
    }

    private Map<String, Object> sharedMetadata() {
        return MechanicSharedServiceRecordResponse.from(recordWithMetadata(), List.of()).fieldMetadata();
    }

    @Test
    @DisplayName("the receipt's OCR transcript never reaches a mechanic")
    void rawOcrTextIsNotShared() {
        Map<String, Object> shared = sharedMetadata();
        assertNotNull(shared);
        assertFalse(shared.containsKey("rawOcrText"), "rawOcrText must not be shared");

        String rendered = shared.toString();
        assertFalse(rendered.contains("JUAN DELA CRUZ"), "owner name leaked: " + rendered);
        assertFalse(rendered.contains("Mabini"), "home address leaked");
        assertFalse(rendered.contains("0917"), "phone number leaked");
        assertFalse(rendered.contains("JTDBR32E030088888"), "VIN leaked");
    }

    @Test
    @DisplayName("per-page rawText is stripped, but the image pointer survives")
    void pagesKeepOnlyWhatTheViewerNeeds() {
        Map<String, Object> shared = sharedMetadata();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> pages = (List<Map<String, Object>>) shared.get("storedReceiptPages");
        assertEquals(1, pages.size());

        Map<String, Object> page = pages.get(0);
        // Kept: exactly what ReceiptStrip reads to fetch and label the image.
        assertEquals("service-receipts", page.get("bucket"));
        assertEquals("owner/vehicle/page-1.jpg", page.get("path"));
        assertEquals(1, page.get("pageNumber"));
        // Dropped: everything else, including a filename that names the owner.
        assertNull(page.get("rawText"));
        assertNull(page.get("originalFilename"));
        assertNull(page.get("ocrStatus"));
        assertEquals(3, page.size(), "page should carry three keys, got " + page.keySet());
    }

    @Test
    @DisplayName("internal extraction details are not disclosed")
    void internalsAreNotShared() {
        Map<String, Object> shared = sharedMetadata();
        for (String key : List.of("ocrProvider", "aiProvider", "aiModel", "fieldSources", "errorMessage")) {
            assertFalse(shared.containsKey(key), key + " must not be shared");
        }
        // Classification stays: the detail page renders it as the service chips.
        assertTrue(shared.containsKey("classification"));
        assertEquals(2, shared.size(), "unexpected keys: " + shared.keySet());
    }

    @Test
    @DisplayName("a record with no metadata stays null rather than becoming an empty map")
    void nullMetadataStaysNull() {
        ServiceRecord bare = new ServiceRecord();
        assertNull(MechanicSharedServiceRecordResponse.from(bare, List.of()).fieldMetadata());
    }
}
