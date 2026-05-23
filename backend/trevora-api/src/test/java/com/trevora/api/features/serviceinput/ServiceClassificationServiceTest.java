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

        assertThat(result.serviceCategory()).isEqualTo("Other");
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
}
