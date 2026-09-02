package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The reference numbers printed on a service document.
 *
 * <p>These were extracted for a while before they were kept anywhere a screen
 * could reach, which made them useless. A service centre's reference number is
 * the key to that shop's own system: an owner who can quote
 * "Toyota Talisay, repair order G7IA123581" gets back what the technician
 * actually found, the parts by number, the specs - everything the dealership
 * recorded and this app never saw. That is the mechanic handoff working, and it
 * turns on a string.
 *
 * <p>A small shop prints none of this. Null and empty are correct answers, not
 * missing data, and nothing downstream may treat a record without them as
 * incomplete.
 */
class DocumentNumberTest {

    private final OpenAIServiceDraftExtractionProvider provider =
            new OpenAIServiceDraftExtractionProvider(new ObjectMapper(), "test-key", "gpt-4o-mini");

    @Test
    void aDealershipInvoiceKeepsItsOwnNumberAndTheOneItPointsAt() {
        // The real Talisay invoice: its own number, and the repair order it
        // was raised against.
        ReceiptDraftFields fields = parse(draft("\"G7YA009184\"", "[\"G7IA123581\"]"));

        assertThat(fields.documentNumber()).isEqualTo("G7YA009184");
        assertThat(fields.referenceNumbers()).containsExactly("G7IA123581");
    }

    @Test
    void aReceiptCanPointAtSeveralDocuments() {
        // The official receipt names both the invoice it paid and the repair
        // order behind it. Both are how the rest of the visit is found again.
        ReceiptDraftFields fields = parse(draft("\"1000000000124652\"",
                "[\"G7YA009184\", \"G7IA123581\"]"));

        assertThat(fields.referenceNumbers()).containsExactly("G7YA009184", "G7IA123581");
    }

    @Test
    void aTalyerReceiptWithNoPrintedNumberIsComplete() {
        // Most receipts this product will ever see. Absent is the right answer.
        ReceiptDraftFields fields = parse(draft("null", "[]"));

        assertThat(fields.documentNumber()).isNull();
        assertThat(fields.referenceNumbers()).isEmpty();
    }

    @Test
    void theDraftStoresBothRatherThanOnlyTheMetadata() {
        // The point of the change: they used to live in field_metadata, where
        // nothing could query them and no screen could show them.
        ServiceDraft draft = new ServiceDraft();
        draft.setDocumentNumber("  G7YA009184  ");
        draft.setReferenceNumbers(List.of("G7IA123581"));

        assertThat(draft.getDocumentNumber()).isEqualTo("G7YA009184");
        assertThat(draft.getReferenceNumbers()).containsExactly("G7IA123581");
    }

    @Test
    void aBlankNumberIsStoredAsAbsentRatherThanAsEmptyText() {
        // Whitespace from OCR must not become a reference number a mechanic
        // would try to quote.
        ServiceDraft draft = new ServiceDraft();
        draft.setDocumentNumber("   ");

        assertThat(draft.getDocumentNumber()).isNull();
    }

    @Test
    void referenceNumbersDefaultToEmptyRatherThanNull() {
        // Callers iterate this without a null check, and a jsonb column
        // defaulting to '[]' should be matched on the Java side.
        ServiceDraft draft = new ServiceDraft();

        assertThat(draft.getReferenceNumbers()).isEmpty();
        draft.setReferenceNumbers(null);
        assertThat(draft.getReferenceNumbers()).isEmpty();
    }

    private String draft(String documentNumber, String referenceNumbers) {
        return envelope("""
                {
                  "documentType": "SERVICE_INVOICE",
                  "documentNumber": %s,
                  "referenceNumbers": %s,
                  "serviceDate": "2025-04-30",
                  "services": [],
                  "odometer": null,
                  "totalCost": 3106.49,
                  "shopName": null,
                  "location": null,
                  "remarks": null,
                  "classification": null,
                  "confidenceNotes": [],
                  "fieldSources": {},
                  "fieldConfidence": {},
                  "aiSuggestedFields": [],
                  "warnings": []
                }
                """.formatted(documentNumber, referenceNumbers));
    }

    private String envelope(String contentJson) {
        String escaped = contentJson.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
        return "{\"choices\":[{\"message\":{\"content\":\"" + escaped + "\"}}]}";
    }

    private ReceiptDraftFields parse(String responseBody) {
        try {
            Method method = OpenAIServiceDraftExtractionProvider.class
                    .getDeclaredMethod("parseOpenAIResponse", String.class, List.class);
            method.setAccessible(true);
            return (ReceiptDraftFields) method.invoke(provider, responseBody, List.of());
        } catch (ReflectiveOperationException exception) {
            throw new RuntimeException(exception);
        }
    }
}
