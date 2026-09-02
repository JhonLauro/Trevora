package com.trevora.api.features.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The template that explains a record when the model cannot.
 *
 * <p>It is the fallback, not the showpiece, which is exactly why it needs
 * tests: nobody looks at it until the day the key is missing or the provider
 * is down, and on that day it is the only thing the owner reads.
 *
 * <p>The case that prompted these: a body and paint record whose materials
 * included "WASTE PAD-BP" was explained to its owner as brake service, because
 * the matcher searched the parts text for the substring "pad".
 */
class ExplanationTemplateTest {
    /* A phrase unique to each paragraph, not the whole thing: these tests are
       about which paragraph gets chosen, and should not fail when somebody
       improves the wording of one. */
    private static final String BRAKES = "Your brakes are what you rely on";
    private static final String GENERIC = "Having this written down";

    private String whyItMatters(String serviceType, String parts, String labor) throws Exception {
        AIExplanationService service = new AIExplanationService(null, null, null, null, null, null);
        Method method = AIExplanationService.class.getDeclaredMethod(
                "buildWhyItMatters", String.class, String.class, String.class);
        method.setAccessible(true);
        return (String) method.invoke(service, serviceType, parts, labor);
    }

    @Test
    @DisplayName("a paint job is not explained as brake service")
    void paintJobIsNotBrakeService() throws Exception {
        String explanation = whyItMatters(
                "Body & Paint",
                "FLOORMATOK-BP, PLASTIC COVER SET, WASTE PAD-BP, MASKING TAPE",
                "PAINTING JOB, PROPERLY INSTALLED GENUINE PARTS");

        assertThat(explanation).doesNotContain(BRAKES);
        assertThat(explanation).contains(GENERIC);
    }

    @Test
    @DisplayName("real brake work still gets the brake paragraph")
    void brakeWorkIsExplained() throws Exception {
        assertThat(whyItMatters("Brake service", "Brake pads (front)", "Pad replacement"))
                .contains(BRAKES);
    }

    @Test
    @DisplayName("oil work still gets the oil paragraph")
    void oilWorkIsExplained() throws Exception {
        assertThat(whyItMatters("Oil change", "Engine oil, oil filter", "Drain and refill"))
                .contains("Fresh oil and a new filter");
    }

    @Test
    @DisplayName("a word inside a longer word is not a match")
    void doesNotMatchOnSubstrings() throws Exception {
        // "entire" contains "tire"; "padding" contains "pad".
        assertThat(whyItMatters("Entire underbody treatment", "", "")).contains(GENERIC);
        assertThat(whyItMatters("Seat padding repair", "", "")).contains(GENERIC);
    }

    @Test
    @DisplayName("parts and labour no longer decide the paragraph")
    void onlyTheServiceTypeDecides() throws Exception {
        /* The parts list of a paint job mentions brakes nowhere, but a receipt
           is a bag of words and the next one might. What the work *was* is the
           service type; everything else is inventory. */
        assertThat(whyItMatters("Body & Paint", "brake cleaner used as degreaser", ""))
                .doesNotContain(BRAKES);
    }

    @Test
    @DisplayName("nothing recorded still says something true")
    void emptyRecordFallsBackToTheGenericParagraph() throws Exception {
        assertThat(whyItMatters(null, null, null)).contains(GENERIC);
        assertThat(whyItMatters("", "", "")).contains(GENERIC);
    }
}
