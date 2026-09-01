package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * What the parser does once it knows which sheet of the stack it is reading.
 *
 * <p>The classification is worth nothing on its own — it has to change
 * something. These tests pin the two things it changes: an estimate's total is
 * labelled as quoted rather than paid, and a receipt that priced the visit
 * without describing it says so instead of looking like an ordinary record with
 * no line items.
 *
 * <p>The figures come from one real Toyota Talisay visit: the repair order read
 * ₱5,534.01, the service invoice for the same work read ₱3,106.49, and the
 * official receipt carried the ₱3,106.49 and not one word about what was done.
 */
class DocumentTypeExtractionTest {

    private final OpenAIServiceDraftExtractionProvider provider =
            new OpenAIServiceDraftExtractionProvider(new ObjectMapper(), "test-key", "gpt-4o-mini");

    @Test
    void anEstimateTotalIsRecordedAsQuotedRatherThanPaid() {
        ReceiptDraftFields fields = parse(draft("ESTIMATE", "5534.01", "[]"));

        assertThat(fields.documentType()).isEqualTo(DocumentType.ESTIMATE);
        // The value itself still comes through. It was printed, it is real, and
        // blanking it would lose the only record of what was quoted.
        assertThat(fields.totalCost()).isEqualByComparingTo("5534.01");
        assertThat(fields.warnings())
                .anyMatch(warning -> warning.contains("5534.01") && warning.contains("not necessarily what was paid"));
    }

    @Test
    void aFinalInvoiceCarriesNoSuchWarning() {
        ReceiptDraftFields fields = parse(draft("SERVICE_INVOICE", "3106.49", "[]"));

        assertThat(fields.documentType()).isEqualTo(DocumentType.SERVICE_INVOICE);
        assertThat(fields.warnings())
                .noneMatch(warning -> warning.contains("not necessarily what was paid"));
    }

    @Test
    void aReceiptWithNoWorkSaysTheServiceDetailsAreMissing() {
        ReceiptDraftFields fields = parse(draft("OFFICIAL_RECEIPT", "3106.49", "[]"));

        assertThat(fields.totalCost()).isEqualByComparingTo("3106.49");
        assertThat(fields.warnings())
                .anyMatch(warning -> warning.contains("does not say what work was done"));
        // The cost is good. Only the work is missing, and the warning has to
        // say which is which or a reviewer will distrust both.
        assertThat(fields.warnings())
                .anyMatch(warning -> warning.contains("must not be guessed"));
    }

    @Test
    void anOlderResponseWithNoDocumentTypeKeepsItsCost() {
        // Voice drafts and anything that predates the field. Defaulting to
        // ESTIMATE here would have quietly demoted every one of them.
        ReceiptDraftFields fields = parse(draftWithoutDocumentType());

        assertThat(fields.documentType()).isEqualTo(DocumentType.SERVICE_INVOICE);
        assertThat(fields.warnings())
                .noneMatch(warning -> warning.contains("not necessarily what was paid"));
    }

    private String draft(String documentType, String totalCost, String services) {
        return envelope("""
                {
                  "documentType": "%s",
                  "documentNumber": "G7IA123581",
                  "referenceNumbers": ["G7YA009184"],
                  "serviceDate": "2025-04-30",
                  "services": %s,
                  "odometer": 242,
                  "totalCost": %s,
                  "shopName": "Toyota Talisay, Cebu",
                  "location": null,
                  "remarks": null,
                  "classification": null,
                  "confidenceNotes": [],
                  "fieldSources": {},
                  "fieldConfidence": {},
                  "aiSuggestedFields": [],
                  "warnings": []
                }
                """.formatted(documentType, services, totalCost));
    }

    private String draftWithoutDocumentType() {
        return envelope("""
                {
                  "serviceDate": "2025-04-30",
                  "services": [],
                  "odometer": 242,
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
                """);
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
