package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class ServiceClassificationServiceTest {
    private final ServiceClassificationService service = new ServiceClassificationService();

    @Test
    void sanitizesInvalidAiLabelsAndFallsBackToKeywordsForComponents() {
        ServiceClassification ai = new ServiceClassification(
                "Brake fluid and tire inspection",
                "Very Important",
                List.of("Wheel Assembly", "Unknown Thing"),
                List.of("unsafe<script>", "needs review"),
                null,
                "AI",
                List.of("AI was uncertain."),
                true
        );

        ServiceClassification result = service.classifyAiOrFallback(
                ai,
                "Brake fluid checked. Tire rotation and wheel alignment performed.",
                null,
                null,
                "Tire rotation and wheel alignment",
                "Brake fluid checked",
                2
        );

        // "Very Important" is not a category, and the answer to that is now that
        // nobody has categorised this - not that nothing fits it.
        assertThat(result.serviceCategory()).isEqualTo(ServiceClassificationService.UNCATEGORIZED);
        assertThat(result.relatedComponents()).containsExactly("Brakes", "Tires", "Suspension");
        assertThat(result.confidence()).isEqualTo("medium");
        assertThat(result.source()).isEqualTo("MIXED");
        assertThat(result.notes()).anyMatch(note -> note.contains("controlled list"));
        assertThat(result.notes()).anyMatch(note -> note.contains("multiple pages"));
        assertThat(result.needsOwnerReview()).isTrue();
    }

    @Test
    void keywordFallbackClassifiesMixedLaborAndParts() {
        ServiceClassification result = service.keywordFallback(
                "Synthetic engine oil 5W-30, oil filter, front brake pad set. Labor: oil change and brake service.",
                null,
                "Synthetic engine oil 5W-30, oil filter, front brake pad set",
                "Oil change and brake service",
                null,
                1
        );

        assertThat(result.normalizedServiceType()).isEqualTo("Oil Change & Filter");
        assertThat(result.serviceCategory()).isEqualTo("Maintenance");
        assertThat(result.relatedComponents()).contains("Engine Oil", "Oil Filter", "Engine", "Brakes");
        assertThat(result.confidence()).isEqualTo("medium");
        assertThat(result.source()).isEqualTo("KEYWORD_FALLBACK");
    }

    @Test
    void classifiesEachLineItemIndependentlyWhenLoopedOverAVisitWithMultipleServices() {
        // Simulates how OCRProcessingService/VoiceProcessingService/ServiceInputService now call this
        // service once per service_draft_items / service_record_items row (a single visit can have
        // multiple distinct services), instead of once per whole draft.
        List<ServiceItemRequest> visitServices = List.of(
                new ServiceItemRequest(null, "Oil Change", "Engine oil, oil filter", "Drain and refill", null, null),
                new ServiceItemRequest(null, "Tire Rotation", null, "Rotated all four tires", null, null),
                new ServiceItemRequest(null, "Brake Pad Replacement", "Front brake pads", "Replaced worn pads", null, null)
        );

        List<ServiceClassification> classifications = visitServices.stream()
                .map(item -> service.keywordFallback(null, item.serviceType(), item.partsReplaced(), item.laborPerformed(), null, 1))
                .toList();

        assertThat(classifications).hasSize(3);
        assertThat(classifications.get(0).serviceCategory()).isEqualTo("Maintenance");
        assertThat(classifications.get(1).serviceCategory()).isEqualTo("Maintenance");
        assertThat(classifications.get(2).serviceCategory()).isEqualTo("Repair");
        // Each item is classified independently: the brake item's category must not leak into the
        // oil change or tire rotation items just because they were processed in the same loop.
        assertThat(classifications.get(0).relatedComponents()).contains("Engine Oil", "Oil Filter");
        assertThat(classifications.get(2).relatedComponents()).contains("Brakes");
        assertThat(classifications.get(0).relatedComponents()).doesNotContain("Brakes");
    }

    @Test
    void theKeywordFallbackNeverReturnsOther() {
        // Text with nothing categorisable in it. The honest answer is that
        // nobody has decided, which is not the same as deciding "none of these".
        ServiceClassification result =
                service.keywordFallback("Thank you for your business", null, null, null, null, 1);

        assertThat(result.serviceCategory()).isEqualTo(ServiceClassificationService.UNCATEGORIZED);
        assertThat(result.serviceCategory()).isNotEqualTo("Other");
    }

    @Test
    void anAiAnswerOfOtherIsTreatedAsNoAnswer() {
        /*
         * "Other" means the owner looked and none of these fit. A model is not
         * in a position to make that judgement, so it is not offered the value
         * and is not believed if it returns one anyway.
         */
        ServiceClassification ai = new ServiceClassification(
                "Something", "Other", List.of("Brakes"), List.of(), "high", "AI", List.of(), false);

        ServiceClassification result =
                service.classifyAiOrFallback(ai, "brake pads replaced", null, null, null, null, 1);

        assertThat(result.serviceCategory()).isEqualTo(ServiceClassificationService.UNCATEGORIZED);
    }

    @Test
    void noClassifierPathCanEverProduceOther() {
        // The rule stated once, over every route a category can arrive by.
        List<String> haystacks = List.of(
                "", "Thank you for your business", "oil change", "brake service",
                "warranty claim", "emergency tow", "diagnostic inspection", "replace battery");

        for (String haystack : haystacks) {
            assertThat(service.keywordFallback(haystack, null, null, null, null, 1).serviceCategory())
                    .describedAs("keyword fallback for '%s'", haystack)
                    .isNotEqualTo("Other");

            ServiceClassification ai = new ServiceClassification(
                    null, "Other", List.of(), List.of(), null, "AI", List.of(), false);
            assertThat(service.classifyAiOrFallback(ai, haystack, null, null, null, null, 1).serviceCategory())
                    .describedAs("AI path for '%s'", haystack)
                    .isNotEqualTo("Other");
        }
    }

    @Test
    void otherAndUncategorizedAreBothAllowedValuesButNeitherIsOfferedToAClassifier() {
        assertThat(ServiceClassificationService.ALLOWED_SERVICE_CATEGORIES)
                .contains("Other", ServiceClassificationService.UNCATEGORIZED);
        assertThat(ServiceClassificationService.CLASSIFIABLE_SERVICE_CATEGORIES)
                .doesNotContain("Other", ServiceClassificationService.UNCATEGORIZED)
                .containsExactly("Maintenance", "Repair", "Inspection", "Replacement", "Warranty", "Emergency");
    }

    @Test
    void anUndecidedCategoryIsNotCarriedAsASearchableTag() {
        /*
         * Only the category is asserted on. "Other" also appears here as a
         * *component* - a different vocabulary on a different axis, and a
         * legitimate tag - so this checks the value the category contributes
         * rather than the absence of the word.
         */
        ServiceClassification result =
                service.keywordFallback("Thank you for your business", null, null, null, null, 1);

        assertThat(result.serviceCategory()).isEqualTo(ServiceClassificationService.UNCATEGORIZED);
        assertThat(result.recordTags()).doesNotContain(ServiceClassificationService.UNCATEGORIZED);
    }
}
