package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The repair that turns a reply cut off at the token cap into readable JSON.
 *
 * <p>What it protects: a spiralling lineEntries array used to cost the whole
 * extraction, because everything the model had already written was thrown away
 * with the half-written part. The Toyota Talisay service invoice did this on
 * every golden run.
 */
class TruncatedAnswerSalvageTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    private void assertParses(String repaired) throws Exception {
        assertThat(repaired).isNotNull();
        objectMapper.readTree(repaired);
    }

    @Test
    @DisplayName("closes an object cut off mid-value and keeps the fields already written")
    void closesObjectCutMidValue() throws Exception {
        String repaired = OpenAIServiceDraftExtractionProvider.closeTruncatedJson(
                "{\"serviceDate\":\"2025-04-30\",\"totalCost\":3106.4");

        assertParses(repaired);
        assertThat(objectMapper.readTree(repaired).get("serviceDate").asText()).isEqualTo("2025-04-30");
        // The half-written number is dropped rather than guessed at: 3106.4 is
        // not 3106.49, and a wrong total is worse than a missing one.
        assertThat(objectMapper.readTree(repaired).has("totalCost")).isFalse();
    }

    @Test
    @DisplayName("closes a nested array that stopped mid-entry, keeping the entries that finished")
    void closesNestedArrayMidEntry() throws Exception {
        String repaired = OpenAIServiceDraftExtractionProvider.closeTruncatedJson(
                "{\"shopName\":\"Toyota Talisay\",\"services\":[{\"serviceType\":\"PMS\"},{\"serviceTyp");

        assertParses(repaired);
        assertThat(objectMapper.readTree(repaired).get("services")).hasSize(1);
        assertThat(objectMapper.readTree(repaired).get("shopName").asText()).isEqualTo("Toyota Talisay");
    }

    @Test
    @DisplayName("a brace or bracket inside a string is not nesting")
    void ignoresBracesInsideStrings() throws Exception {
        String repaired = OpenAIServiceDraftExtractionProvider.closeTruncatedJson(
                "{\"remarks\":\"replaced filter [OEM] {see note}\",\"odometer\":24");

        assertParses(repaired);
        assertThat(objectMapper.readTree(repaired).get("remarks").asText())
                .isEqualTo("replaced filter [OEM] {see note}");
    }

    @Test
    @DisplayName("an escaped quote does not end the string")
    void handlesEscapedQuotes() throws Exception {
        String repaired = OpenAIServiceDraftExtractionProvider.closeTruncatedJson(
                "{\"shopName\":\"GTA \\\"Toledo\\\" Auto\",\"location\":\"Toledo");

        assertParses(repaired);
        assertThat(objectMapper.readTree(repaired).get("shopName").asText()).isEqualTo("GTA \"Toledo\" Auto");
    }

    @Test
    @DisplayName("already-complete JSON survives untouched")
    void leavesCompleteJsonAlone() throws Exception {
        String complete = "{\"serviceDate\":\"2025-04-30\"}";

        assertThat(objectMapper.readTree(OpenAIServiceDraftExtractionProvider.closeTruncatedJson(complete)))
                .isEqualTo(objectMapper.readTree(complete));
    }

    @Test
    @DisplayName("nothing complete written yet salvages nothing rather than inventing a shape")
    void refusesWhenNothingComplete() {
        assertThat(OpenAIServiceDraftExtractionProvider.closeTruncatedJson("{\"serviceDat")).isNull();
        assertThat(OpenAIServiceDraftExtractionProvider.closeTruncatedJson("")).isNull();
    }
}
