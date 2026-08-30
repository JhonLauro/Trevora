package com.trevora.api.features.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.trevora.api.features.ai.OpenAIExplanationProvider.Explanation;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Trevora did not do the work described in a record and must never say it did.
 *
 * <p>The prompt says so, and the model still wrote "we performed preventive
 * maintenance" and then, on the same record, "I performed preventive
 * maintenance". These tests cover the check that catches it when the prompt
 * does not.
 */
class FirstPersonGuardTest {
    private Explanation whatWasDone(String text) {
        return new Explanation(text, "Keeping up with this protects the engine.", List.of("Any new noise"));
    }

    @Test
    @DisplayName("the two sentences that actually shipped are caught")
    void catchesWhatWasSeenInProduction() {
        assertThat(OpenAIExplanationProvider.usesFirstPerson(
                whatWasDone("On August 24, 2026, I performed preventive maintenance on your Honda Beat.")))
                .isTrue();
        assertThat(OpenAIExplanationProvider.usesFirstPerson(
                whatWasDone("We performed preventive maintenance on your Honda Beat.")))
                .isTrue();
    }

    @Test
    @DisplayName("first person is caught wherever in the explanation it appears")
    void checksEveryField() {
        assertThat(OpenAIExplanationProvider.usesFirstPerson(new Explanation(
                "Your car had its oil changed.", "Our records show this matters.", List.of("Leaks"))))
                .isTrue();
        assertThat(OpenAIExplanationProvider.usesFirstPerson(new Explanation(
                "Your car had its oil changed.", "Fresh oil protects the engine.", List.of("Call us if it leaks"))))
                .isTrue();
    }

    @Test
    @DisplayName("the wording we want is not flagged")
    void acceptsThirdPerson() {
        assertThat(OpenAIExplanationProvider.usesFirstPerson(new Explanation(
                "Toyota Talisay changed the oil and filter on your Honda Beat.",
                "Fresh oil keeps the engine from wearing early.",
                List.of("A knocking sound when cold"))))
                .isFalse();
    }

    @Test
    @DisplayName("whole words only, so ordinary sentences survive")
    void doesNotMatchInsideWords() {
        /* "Vios" and "Mirage" contain i; "focus" and "chassis" contain us;
           "mine" must not be found inside "determine". */
        assertThat(OpenAIExplanationProvider.usesFirstPerson(whatWasDone(
                "The shop set the focus of the chassis alignment on your Toyota Vios "
                        + "and ran a test to determine the wear on the Mirage's tyres.")))
                .isFalse();
    }

    @Test
    @DisplayName("nothing to check is not a failure")
    void handlesEmptyInput() {
        assertThat(OpenAIExplanationProvider.usesFirstPerson(null)).isFalse();
        assertThat(OpenAIExplanationProvider.usesFirstPerson(
                new Explanation("", null, List.of()))).isFalse();
    }
}
