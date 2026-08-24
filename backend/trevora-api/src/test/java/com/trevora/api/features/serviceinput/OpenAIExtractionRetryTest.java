package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * A rate limit or a timeout used to drop straight to the raw-OCR fallback,
 * costing the owner every extracted field over a condition that clears in a
 * second. These cover which failures are worth a second attempt and which are
 * the provider saying the request itself is wrong.
 */
class OpenAIExtractionRetryTest {

    private static final String URL = "https://api.openai.com/v1/chat/completions";

    private static final String VALID_RESPONSE = """
            {"choices":[{"message":{"content":"{\\"serviceDate\\":\\"2026-08-15\\",\\"services\\":[],\
            \\"odometer\\":null,\\"totalCost\\":null,\\"shopName\\":\\"Retry Motors\\",\
            \\"location\\":null,\\"remarks\\":null,\\"classification\\":null,\
            \\"confidenceNotes\\":[],\\"fieldSources\\":{},\\"fieldConfidence\\":{},\
            \\"aiSuggestedFields\\":[],\\"warnings\\":[]}"}}]}""";

    private final RestClient.Builder builder = RestClient.builder();
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    private final OpenAIServiceDraftExtractionProvider provider =
            new OpenAIServiceDraftExtractionProvider(new ObjectMapper(), builder.build(), "test-key", "gpt-4o-mini");

    @Test
    void recoversWhenARateLimitClearsOnTheSecondAttempt() {
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        server.expect(requestTo(URL)).andRespond(withSuccess(VALID_RESPONSE, MediaType.APPLICATION_JSON));

        ReceiptDraftFields fields = provider.extractFields("SHOP RECEIPT\nCHANGE OIL 1200.00\n");

        assertThat(fields.shopName()).isEqualTo("Retry Motors");
        server.verify();
    }

    @Test
    void recoversFromATransientServerError() {
        server.expect(requestTo(URL)).andRespond(withServerError());
        server.expect(requestTo(URL)).andRespond(withSuccess(VALID_RESPONSE, MediaType.APPLICATION_JSON));

        assertThat(provider.extractFields("SHOP RECEIPT\n").shopName()).isEqualTo("Retry Motors");
        server.verify();
    }

    @Test
    void retriesABodyThatArrivedTruncated() {
        // Observed against the real API: a 200 whose body stops mid-object. A
        // strict schema constrains what the model generates, not what survives
        // the wire.
        server.expect(requestTo(URL)).andRespond(
                withSuccess("{\"choices\":[{\"message\":{\"content\":", MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL)).andRespond(withSuccess(VALID_RESPONSE, MediaType.APPLICATION_JSON));

        assertThat(provider.extractFields("SHOP RECEIPT\n").shopName()).isEqualTo("Retry Motors");
        server.verify();
    }

    @Test
    void retriesAResponseCutOffAtTheTokenLimit() {
        // The golden set hit this twice on receipts that extracted cleanly on
        // the runs either side, at temperature 0 with identical input.
        server.expect(requestTo(URL)).andRespond(withSuccess(
                "{\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":\"{\"}}]}",
                MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL)).andRespond(withSuccess(VALID_RESPONSE, MediaType.APPLICATION_JSON));

        assertThat(provider.extractFields("SHOP RECEIPT\n").shopName()).isEqualTo("Retry Motors");
        server.verify();
    }

    @Test
    void reportsTheTokenCountsWhenEveryAttemptWasCutOff() {
        server.expect(ExpectedCount.times(3), requestTo(URL)).andRespond(withSuccess(
                "{\"usage\":{\"prompt_tokens\":900,\"completion_tokens\":8000},"
                        + "\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":\"{\"}}]}",
                MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.extractFields("SHOP RECEIPT\n"))
                .isInstanceOf(ReceiptProcessingException.class)
                .hasRootCauseMessage("OpenAI extraction hit the response token limit before finishing,"
                        + " so the receipt was only partly read (prompt 900, completion 8000, cap 8000).");
        server.verify();
    }

    @Test
    void doesNotRetryARefusal() {
        server.expect(ExpectedCount.once(), requestTo(URL)).andRespond(withSuccess(
                "{\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"refusal\":\"I cannot help with that.\"}}]}",
                MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.extractFields("SHOP RECEIPT\n"))
                .isInstanceOf(ReceiptProcessingException.class)
                .hasMessageContaining("declined the request");
        server.verify();
    }

    @Test
    void givesUpAfterThreeAttemptsAndReportsTheLastFailure() {
        server.expect(ExpectedCount.times(3), requestTo(URL))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

        assertThatThrownBy(() -> provider.extractFields("SHOP RECEIPT\n"))
                .isInstanceOf(ReceiptProcessingException.class)
                .hasMessageContaining("HTTP status 429");
        server.verify();
    }

    @Test
    void doesNotRetryARequestTheProviderRejected() {
        // 400 means the request or its schema is wrong. Sending it again spends
        // the owner's time to reach the same fallback.
        server.expect(ExpectedCount.once(), requestTo(URL)).andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> provider.extractFields("SHOP RECEIPT\n"))
                .isInstanceOf(ReceiptProcessingException.class)
                .hasMessageContaining("HTTP status 400");
        server.verify();
    }

    @Test
    void doesNotRetryAnInvalidApiKey() {
        server.expect(ExpectedCount.once(), requestTo(URL)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> provider.extractFields("SHOP RECEIPT\n"))
                .isInstanceOf(ReceiptProcessingException.class)
                .hasMessageContaining("HTTP status 401");
        server.verify();
    }
}
