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

    private String chatCompletionEnvelope(String contentJson) {
        String escapedContent = contentJson.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
        return "{\"choices\":[{\"message\":{\"content\":\"" + escapedContent + "\"}}]}";
    }

    private ReceiptDraftFields parseOpenAIResponse(String responseBody) {
        try {
            Method method = OpenAIServiceDraftExtractionProvider.class
                    .getDeclaredMethod("parseOpenAIResponse", String.class);
            method.setAccessible(true);
            return (ReceiptDraftFields) method.invoke(provider, responseBody);
        } catch (ReflectiveOperationException exception) {
            throw new RuntimeException(exception);
        }
    }
}
