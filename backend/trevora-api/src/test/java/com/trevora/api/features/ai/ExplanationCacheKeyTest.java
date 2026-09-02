package com.trevora.api.features.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.trevora.api.features.ai.OpenAIExplanationProvider.Facts;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The rule that decides whether a stored explanation still applies.
 *
 * <p>An explanation is written once and kept, which is only safe while the
 * fingerprint tracks the facts exactly. Too loose and an owner reads an
 * explanation of a record they have since corrected; too tight and the cache
 * never hits and the saving is imaginary.
 */
class ExplanationCacheKeyTest {
    private Facts facts() {
        return new Facts(
                "2019 Honda Beat",
                "Preventive maintenance",
                List.of("Oil filter", "Drain plug washer"),
                List.of("JLLY synthetic engine oil"),
                List.of("Change oil and filter"),
                "Honda Talisay",
                "24 August 2026",
                "18400 km",
                "PHP 10,585.60",
                null);
    }

    @Test
    @DisplayName("the same record fingerprints the same way twice")
    void isStable() {
        assertThat(AIExplanationService.fingerprintOf(facts()))
                .isEqualTo(AIExplanationService.fingerprintOf(facts()))
                .hasSize(64);
    }

    @Test
    @DisplayName("correcting any fact invalidates the stored explanation")
    void changesWithTheFacts() {
        String original = AIExplanationService.fingerprintOf(facts());
        Facts f = facts();

        assertThat(AIExplanationService.fingerprintOf(new Facts(
                f.vehicle(), "Brake service", f.partsFitted(), f.materialsUsed(), f.workPerformed(),
                f.shop(), f.date(), f.odometer(), f.totalCost(), f.remarks())))
                .isNotEqualTo(original);

        assertThat(AIExplanationService.fingerprintOf(new Facts(
                f.vehicle(), f.serviceTypes(), List.of("Oil filter"), f.materialsUsed(), f.workPerformed(),
                f.shop(), f.date(), f.odometer(), f.totalCost(), f.remarks())))
                .isNotEqualTo(original);

        assertThat(AIExplanationService.fingerprintOf(new Facts(
                f.vehicle(), f.serviceTypes(), f.partsFitted(), f.materialsUsed(), f.workPerformed(),
                f.shop(), "25 August 2026", f.odometer(), f.totalCost(), f.remarks())))
                .isNotEqualTo(original);

        /* Remarks are the owner's own note and they reach the model, so a
           record whose only change is a note must be explained again. */
        assertThat(AIExplanationService.fingerprintOf(new Facts(
                f.vehicle(), f.serviceTypes(), f.partsFitted(), f.materialsUsed(), f.workPerformed(),
                f.shop(), f.date(), f.odometer(), f.totalCost(), "Rattles over bumps")))
                .isNotEqualTo(original);
    }

    @Test
    @DisplayName("two different records do not share an explanation")
    void separatesDifferentVehicles() {
        Facts f = facts();
        assertThat(AIExplanationService.fingerprintOf(new Facts(
                "2015 Toyota Vios", f.serviceTypes(), f.partsFitted(), f.materialsUsed(), f.workPerformed(),
                f.shop(), f.date(), f.odometer(), f.totalCost(), f.remarks())))
                .isNotEqualTo(AIExplanationService.fingerprintOf(f));
    }
}
