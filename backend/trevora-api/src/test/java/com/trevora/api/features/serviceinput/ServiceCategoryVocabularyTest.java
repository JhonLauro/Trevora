package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.shared.dto.ServiceItemResponse;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * One vocabulary for {@code service_category}, in one place.
 *
 * <p>It was defined four times and the four disagreed: the constant, two
 * hardcoded copies inside the extraction prompts, and a keyword table in a DTO.
 * Nothing failed when they drifted, because nothing compared them - a prompt
 * offering a value the backend rejects produces a category that is silently
 * discarded, and a DTO inventing one produces a category nothing ever decided.
 *
 * <p>These tests are the comparison. They are cheap, they call no API, and they
 * fail the moment someone edits one copy without the other.
 */
class ServiceCategoryVocabularyTest {

    private final OpenAIServiceDraftExtractionProvider provider =
            new OpenAIServiceDraftExtractionProvider(new ObjectMapper(), "test-key", "gpt-4o-mini");

    @Test
    @DisplayName("the receipt prompt offers exactly the classifiable categories")
    void receiptPromptMatchesTheConstant() {
        String prompt = provider.systemPrompt(VehicleContext.UNKNOWN);

        assertThat(prompt).contains(expectedCategoryLine());
        assertThatPromptOffersNothingElse(prompt);
    }

    @Test
    @DisplayName("the voice prompt offers exactly the classifiable categories")
    void voicePromptMatchesTheConstant() {
        String prompt = provider.voiceSystemPrompt();

        assertThat(prompt).contains(expectedCategoryLine());
        assertThatPromptOffersNothingElse(prompt);
    }

    /**
     * The line as the model is actually sent it. Written out here rather than
     * built from the same expression the prompt uses, so that a change to the
     * joining has to be made twice and thought about once.
     */
    private static String expectedCategoryLine() {
        return "Classification must use only these serviceCategory values:\n"
                + "Maintenance, Repair, Inspection, Replacement, Warranty, Emergency.";
    }

    /**
     * Neither value a classifier may not choose may appear in the offered list.
     *
     * <p>Checked against the rendered line rather than the whole prompt: the
     * word "other" turns up in ordinary prose all over these instructions, and
     * asserting on the whole document would fail for reasons that have nothing
     * to do with the vocabulary.
     */
    private static void assertThatPromptOffersNothingElse(String prompt) {
        String offered = prompt.substring(
                prompt.indexOf("Classification must use only these serviceCategory values:"));
        String line = offered.split("\n")[1];

        assertThat(line).doesNotContain("Other");
        assertThat(line).doesNotContain(ServiceClassificationService.UNCATEGORIZED);
        for (String category : ServiceClassificationService.CLASSIFIABLE_SERVICE_CATEGORIES) {
            assertThat(line).contains(category);
        }
    }

    @Test
    @DisplayName("a legacy row with no category is admitted, not guessed at")
    void legacyRowsWithNoCategoryReadAsUncategorized() {
        /*
         * 007_service_line_items backfilled these rows before service_category
         * existed. The DTO used to guess one from keywords, so an old row read
         * "Maintenance" and looked exactly like a row something had classified.
         */
        ServiceRecordItemStub item = new ServiceRecordItemStub("Oil Change", null);

        assertThat(categoryOf(item)).isEqualTo(ServiceClassificationService.UNCATEGORIZED);
    }

    @Test
    @DisplayName("a row that was classified keeps its category")
    void aStoredCategorySurvives() {
        ServiceRecordItemStub item = new ServiceRecordItemStub("Oil Change", "Maintenance");

        assertThat(categoryOf(item)).isEqualTo("Maintenance");
    }

    @Test
    @DisplayName("a blank category is as absent as a null one")
    void blankIsTreatedAsAbsent() {
        assertThat(categoryOf(new ServiceRecordItemStub("Oil Change", "   ")))
                .isEqualTo(ServiceClassificationService.UNCATEGORIZED);
    }

    /**
     * Exercises the DTO's fallback through a real entity, since that is the only
     * way in - the mapping method is private, which is correct.
     */
    private static String categoryOf(ServiceRecordItemStub stub) {
        com.trevora.api.features.servicerecord.ServiceRecordItem item =
                new com.trevora.api.features.servicerecord.ServiceRecordItem();
        item.setServiceType(stub.serviceType());
        item.setServiceCategory(stub.serviceCategory());
        item.setLineEntries(List.of());
        return ServiceItemResponse.from(item).serviceCategory();
    }

    private record ServiceRecordItemStub(String serviceType, String serviceCategory) {
    }

}
