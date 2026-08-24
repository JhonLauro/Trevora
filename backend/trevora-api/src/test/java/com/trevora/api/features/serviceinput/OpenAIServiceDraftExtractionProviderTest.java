package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Covers the OpenAI response parsing contract that OCRProcessingService/VoiceProcessingService
 * depend on: a receipt or transcript describing multiple distinct services must produce one
 * ServiceItemFields entry per service, not a single collapsed item.
 */
class OpenAIServiceDraftExtractionProviderTest {

    private final OpenAIServiceDraftExtractionProvider provider =
            new OpenAIServiceDraftExtractionProvider(new ObjectMapper(), "test-key", "gpt-4o-mini");

    @Test
    void parsesMultipleServicesFromOneReceiptResponse() {
        String responseBody = chatCompletionEnvelope("""
                {
                  "serviceDate": "2026-08-15",
                  "services": [
                    {"serviceType": "Oil Change", "partsReplaced": "Engine oil, oil filter", "laborPerformed": "Drained and replaced oil"},
                    {"serviceType": "Tire Rotation", "partsReplaced": null, "laborPerformed": "Rotated all 4 tires"},
                    {"serviceType": "Brake Inspection", "partsReplaced": null, "laborPerformed": "Inspected front and rear pads"}
                  ],
                  "odometer": 45000,
                  "totalCost": 3500,
                  "shopName": "QA Verify Motors",
                  "location": "Manila",
                  "remarks": "Routine visit",
                  "classification": null,
                  "confidenceNotes": [],
                  "fieldSources": {},
                  "fieldConfidence": {},
                  "aiSuggestedFields": [],
                  "warnings": []
                }
                """);

        ReceiptDraftFields fields = parseOpenAIResponse(responseBody);

        assertThat(fields.services()).hasSize(3);
        assertThat(fields.services()).extracting(ServiceItemFields::serviceType)
                .containsExactly("Oil Change", "Tire Rotation", "Brake Inspection");
        assertThat(fields.services().get(0).partsReplaced()).isEqualTo("Engine oil, oil filter");
        assertThat(fields.services().get(1).partsReplaced()).isNull();
    }

    @Test
    void collapsesToSingleEntryArrayWhenOnlyOneServiceWasPerformed() {
        String responseBody = chatCompletionEnvelope("""
                {
                  "serviceDate": "2026-08-15",
                  "services": [
                    {"serviceType": "Oil Change", "partsReplaced": "Engine oil", "laborPerformed": "Drained and replaced oil"}
                  ],
                  "odometer": null, "totalCost": 1500, "shopName": null, "location": null,
                  "remarks": null, "classification": null, "confidenceNotes": [], "fieldSources": {},
                  "fieldConfidence": {}, "aiSuggestedFields": [], "warnings": []
                }
                """);

        ReceiptDraftFields fields = parseOpenAIResponse(responseBody);

        assertThat(fields.services()).hasSize(1);
        assertThat(fields.services().get(0).serviceType()).isEqualTo("Oil Change");
    }

    @Test
    void returnsEmptyListWhenReceiptHasNoIdentifiableServices() {
        String responseBody = chatCompletionEnvelope("""
                {
                  "serviceDate": null, "services": [], "odometer": null, "totalCost": null,
                  "shopName": null, "location": null, "remarks": null, "classification": null,
                  "confidenceNotes": [], "fieldSources": {}, "fieldConfidence": {},
                  "aiSuggestedFields": [], "warnings": []
                }
                """);

        ReceiptDraftFields fields = parseOpenAIResponse(responseBody);

        assertThat(fields.services()).isEmpty();
    }

    @Test
    void skipsServiceEntriesMissingAServiceType() {
        String responseBody = chatCompletionEnvelope("""
                {
                  "serviceDate": null,
                  "services": [
                    {"serviceType": "Oil Change", "partsReplaced": null, "laborPerformed": null},
                    {"serviceType": null, "partsReplaced": "Unattributed part", "laborPerformed": null}
                  ],
                  "odometer": null, "totalCost": null, "shopName": null, "location": null,
                  "remarks": null, "classification": null, "confidenceNotes": [], "fieldSources": {},
                  "fieldConfidence": {}, "aiSuggestedFields": [], "warnings": []
                }
                """);

        ReceiptDraftFields fields = parseOpenAIResponse(responseBody);

        assertThat(fields.services()).hasSize(1);
        assertThat(fields.services().get(0).serviceType()).isEqualTo("Oil Change");
    }

    @Test
    void readsAnOdometerAsANumberRatherThanARunOfDigits() {
        // "12,345.6 km" stripped to digits reads 123456 - ten times the real
        // reading, and plausible enough that nothing downstream questions it.
        ReceiptDraftFields fields = parseOpenAIResponse(draftWithOdometer("\"12,345.6 km\""));

        assertThat(fields.odometer()).isEqualTo(12346);
        assertThat(fields.warnings()).isEmpty();
    }

    @Test
    void keepsGroupingSeparatorsOutOfAWholeNumberOdometer() {
        ReceiptDraftFields fields = parseOpenAIResponse(draftWithOdometer("\"244,180 KM\""));

        assertThat(fields.odometer()).isEqualTo(244180);
        assertThat(fields.warnings()).isEmpty();
    }

    @Test
    void blanksAnOdometerNoVehicleCouldReachAndSaysSo() {
        ReceiptDraftFields fields = parseOpenAIResponse(draftWithOdometer("99000000"));

        assertThat(fields.odometer()).isNull();
        assertThat(fields.warnings())
                .singleElement(org.assertj.core.api.InstanceOfAssertFactories.STRING)
                .contains("99000000 km")
                .contains("left blank");
    }

    @Test
    void blanksANegativeOdometer() {
        ReceiptDraftFields fields = parseOpenAIResponse(draftWithOdometer("-500"));

        assertThat(fields.odometer()).isNull();
        assertThat(fields.warnings()).isNotEmpty();
    }

    @Test
    void leavesTheOdometerBlankWhenTheReceiptDidNotPrintOne() {
        ReceiptDraftFields fields = parseOpenAIResponse(draftWithOdometer("null"));

        assertThat(fields.odometer()).isNull();
        assertThat(fields.warnings()).isEmpty();
    }

    @Test
    void leavesTextAloneWhenItFitsUnderTheCap() {
        Object result = truncate("line one\nline two\n", 12000, "Receipt OCR text");

        assertThat(truncatedText(result)).isEqualTo("line one\nline two\n");
        assertThat(truncationWarnings(result)).isEmpty();
    }

    @Test
    void warnsAndCutsOnALineBoundaryWhenTextExceedsTheCap() {
        // 40 rows of 20 characters; a 300-character cap lands mid-row.
        String receipt = "ROW 0000 ............\n".repeat(40);

        Object result = truncate(receipt, 300, "Receipt OCR text");

        String kept = truncatedText(result);
        assertThat(kept).hasSizeLessThanOrEqualTo(300);
        // Every line kept is a whole row - no half-row inviting a guessed price.
        assertThat(kept.split("\n")).allSatisfy(row -> assertThat(row).isEqualTo("ROW 0000 ............"));
        assertThat(truncationWarnings(result))
                .singleElement(org.assertj.core.api.InstanceOfAssertFactories.STRING)
                .contains("Receipt OCR text ran to " + receipt.length() + " characters")
                .contains("may be incomplete");
    }

    @Test
    void reportsTruncationAheadOfWhateverTheModelSaidAboutTheFragment() {
        String responseBody = chatCompletionEnvelope("""
                {
                  "serviceDate": "2026-08-15",
                  "services": [],
                  "odometer": null,
                  "totalCost": null,
                  "shopName": null,
                  "location": null,
                  "remarks": null,
                  "classification": null,
                  "confidenceNotes": [],
                  "fieldSources": {},
                  "fieldConfidence": {},
                  "aiSuggestedFields": [],
                  "warnings": ["No total was printed on the receipt."]
                }
                """);

        ReceiptDraftFields fields = parseOpenAIResponse(responseBody, List.of("Receipt OCR text ran to 20000 characters"));

        assertThat(fields.warnings()).containsExactly(
                "Receipt OCR text ran to 20000 characters",
                "No total was printed on the receipt.");
    }

    private String draftWithOdometer(String odometerJson) {
        return chatCompletionEnvelope("""
                {
                  "serviceDate": "2026-08-15",
                  "services": [],
                  "odometer": %s,
                  "totalCost": null,
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
                """.formatted(odometerJson));
    }

    private String chatCompletionEnvelope(String contentJson) {
        String escapedContent = contentJson.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
        return "{\"choices\":[{\"message\":{\"content\":\"" + escapedContent + "\"}}]}";
    }

    private ReceiptDraftFields parseOpenAIResponse(String responseBody) {
        return parseOpenAIResponse(responseBody, List.of());
    }

    private ReceiptDraftFields parseOpenAIResponse(String responseBody, List<String> inputWarnings) {
        try {
            Method method = OpenAIServiceDraftExtractionProvider.class
                    .getDeclaredMethod("parseOpenAIResponse", String.class, List.class);
            method.setAccessible(true);
            return (ReceiptDraftFields) method.invoke(provider, responseBody, inputWarnings);
        } catch (ReflectiveOperationException exception) {
            throw new RuntimeException(exception);
        }
    }

    /** {@code Truncation.of(value, maxChars, label)}, reached reflectively. */
    private Object truncate(String value, int maxChars, String label) {
        try {
            Class<?> truncation = Class.forName(
                    "com.trevora.api.features.serviceinput.OpenAIServiceDraftExtractionProvider$Truncation");
            Method method = truncation.getDeclaredMethod("of", String.class, int.class, String.class);
            method.setAccessible(true);
            return method.invoke(null, value, maxChars, label);
        } catch (ReflectiveOperationException exception) {
            throw new RuntimeException(exception);
        }
    }

    private String truncatedText(Object truncation) {
        return (String) recordComponent(truncation, "text");
    }

    @SuppressWarnings("unchecked")
    private List<String> truncationWarnings(Object truncation) {
        return (List<String>) recordComponent(truncation, "warnings");
    }

    private Object recordComponent(Object truncation, String name) {
        try {
            Method accessor = truncation.getClass().getDeclaredMethod(name);
            accessor.setAccessible(true);
            return accessor.invoke(truncation);
        } catch (ReflectiveOperationException exception) {
            throw new RuntimeException(exception);
        }
    }
}
