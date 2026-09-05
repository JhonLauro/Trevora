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
                "en",
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
                f.language(), f.vehicle(), "Brake service", f.partsFitted(), f.materialsUsed(), f.workPerformed(),
                f.shop(), f.date(), f.odometer(), f.totalCost(), f.remarks())))
                .isNotEqualTo(original);

        assertThat(AIExplanationService.fingerprintOf(new Facts(
                f.language(), f.vehicle(), f.serviceTypes(), List.of("Oil filter"), f.materialsUsed(), f.workPerformed(),
                f.shop(), f.date(), f.odometer(), f.totalCost(), f.remarks())))
                .isNotEqualTo(original);

        assertThat(AIExplanationService.fingerprintOf(new Facts(
                f.language(), f.vehicle(), f.serviceTypes(), f.partsFitted(), f.materialsUsed(), f.workPerformed(),
                f.shop(), "25 August 2026", f.odometer(), f.totalCost(), f.remarks())))
                .isNotEqualTo(original);

        /* Remarks are the owner's own note and they reach the model, so a
           record whose only change is a note must be explained again. */
        assertThat(AIExplanationService.fingerprintOf(new Facts(
                f.language(), f.vehicle(), f.serviceTypes(), f.partsFitted(), f.materialsUsed(), f.workPerformed(),
                f.shop(), f.date(), f.odometer(), f.totalCost(), "Rattles over bumps")))
                .isNotEqualTo(original);
    }

    @Test
    @DisplayName("a different language does not reuse the stored explanation")
    void separatesLanguages() {
        /*
         * The reason there is no `language` column and no second cache key. The
         * fingerprint hashes the prompt, the prompt names the language, so a
         * reader switching to Cebuano gets a fresh generation rather than the
         * English one written for whoever looked first.
         */
        Facts english = facts();
        Facts filipino = new Facts(
                "tl", english.vehicle(), english.serviceTypes(), english.partsFitted(),
                english.materialsUsed(), english.workPerformed(), english.shop(),
                english.date(), english.odometer(), english.totalCost(), english.remarks());
        Facts cebuano = new Facts(
                "ceb", english.vehicle(), english.serviceTypes(), english.partsFitted(),
                english.materialsUsed(), english.workPerformed(), english.shop(),
                english.date(), english.odometer(), english.totalCost(), english.remarks());

        String en = AIExplanationService.fingerprintOf(english);
        String tl = AIExplanationService.fingerprintOf(filipino);
        String ceb = AIExplanationService.fingerprintOf(cebuano);

        assertThat(tl).isNotEqualTo(en);
        assertThat(ceb).isNotEqualTo(en);
        assertThat(ceb).isNotEqualTo(tl);
    }

    @Test
    @DisplayName("the same language on the same facts still hits the cache")
    void sameLanguageStillCaches() {
        assertThat(AIExplanationService.fingerprintOf(facts()))
                .isEqualTo(AIExplanationService.fingerprintOf(facts()));
    }

    @Test
    @DisplayName("two different records do not share an explanation")
    void separatesDifferentVehicles() {
        Facts f = facts();
        assertThat(AIExplanationService.fingerprintOf(new Facts(
                f.language(), "2015 Toyota Vios", f.serviceTypes(), f.partsFitted(), f.materialsUsed(), f.workPerformed(),
                f.shop(), f.date(), f.odometer(), f.totalCost(), f.remarks())))
                .isNotEqualTo(AIExplanationService.fingerprintOf(f));
    }
}
