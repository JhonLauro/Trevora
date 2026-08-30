package com.trevora.api.features.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.shared.http.OutboundHttp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Explains one confirmed record in plain language, using a model.
 *
 * <p>What this replaces was a keyword template: a chain of {@code contains}
 * checks over the record's text that picked one of six paragraphs. It read as
 * AI and was not, and the matching was loose enough to be wrong -- a body and
 * paint job whose materials included "WASTE PAD-BP" matched on "pad" and was
 * explained to the owner as brake service. An explanation that confidently
 * describes work the shop did not do is worse than no explanation.
 *
 * <p>The prompt is built only from what the record actually holds, and the
 * instructions are mostly prohibitions: describe these lines, do not diagnose,
 * do not invent work, do not estimate what it should have cost. The model is
 * here to put the owner's own record into sentences they can use, not to offer
 * an opinion about their car.
 *
 * <p>Nothing here is the extraction prompt. That one is held to the golden set
 * (see CLAUDE.md); this is a separate call on a separate path, and changing it
 * cannot affect what is read off a receipt.
 */
@Component
public class OpenAIExplanationProvider {
    private static final Logger log = LoggerFactory.getLogger(OpenAIExplanationProvider.class);

    private static final String OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
    private static final int MAX_COMPLETION_TOKENS = 700;

    private static final String SYSTEM_PROMPT = """
            You are Trevora, a service-history app. You are writing to the owner of a car
            about work that a repair shop did on it. You did not do the work and were
            not there; you are reading their record back to them so they understand it. \
            They are not a mechanic. Write the way a knowledgeable friend would explain \
            someone else's invoice: warm, direct, and in short sentences.

            You are given the facts recorded for one visit. Work only from those facts.

            Voice:
            - Never "we", "our", "I" or "us". The shop did the work, not you. Name the
              shop when the facts give one -- "Toyota Talisay fitted..." -- and otherwise
              write it as something that happened to the car: "your car had...", "the
              oil and filter were changed".
            - Talk to the owner and about their car: "your car", "you". Never "the \
              vehicle", never "this record shows", never "the customer".
            - Everyday words. If a trade term is unavoidable, say what it does in the \
              same sentence.
            - No headings, no markdown, no bullet characters, no exclamation marks.

            Rules:
            - Describe only work that appears in the facts. Never add a service, part \
              or symptom that is not listed.
            - Do not diagnose the car, predict failures, or say whether the price was \
              fair. You were not there and you cannot see it.
            - If the lines are materials or consumables rather than parts fitted, do \
              not describe them as parts fitted.
            - "whatWasDone" is one or two sentences: what was done to their car, where, \
              and when. Write the date the way a person says it, not as digits.
            - "whyItMatters" is at most two sentences on why this kind of work matters \
              for their car, and nothing else. Only when the facts are too thin to say
              anything specific about the work itself may you fall back to \
              what keeping the history gives them -- and then that is the whole answer,
              never a sentence added to a real one.
            - Do not mention the record, the receipt or the app in "whyItMatters".
              The owner is looking at the record while they read this, so telling
              them it exists spends a sentence on nothing.
            - Never say the same thing twice in different words, and never write a
              sentence that would be true of every record ever saved.
            - "watchFor" is one to three short things they can notice or keep, each \
              following from the work listed. Address them directly. No diagnoses and \
              no service intervals invented from nothing. If the record carries remarks \
              about a guarantee or warranty, one item may restate that.
            - Use the figures exactly as given; never recompute or round them.
            """;

    /* Trevora did not do the work and must never say it did. The prompt says so
       twice, and the model still wrote "we performed" and then "I performed" on
       the same record -- which is the difference between an instruction and a
       guarantee. This is the guarantee: output containing first person is not
       shown to anybody. */
    private static final Pattern FIRST_PERSON =
            Pattern.compile("\\b(we|our|ours|us|i|my|mine)\\b", Pattern.CASE_INSENSITIVE);

    private static final String CORRECTION = """
            Your previous answer used first person. Trevora did not do this work and \
            was not there. Rewrite it with no "we", "our", "I", "us" or "my": attribute \
            the work to the shop named in the facts, or write it as something that \
            happened to the car.
            """;

    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final String apiKey;
    private final String model;

    public OpenAIExplanationProvider(
            ObjectMapper objectMapper,
            @Value("${trevora.ai.openai.api-key:}") String apiKey,
            @Value("${trevora.ai.explanation.model:${trevora.ai.openai.model:gpt-4o-mini}}") String model
    ) {
        this.objectMapper = objectMapper;
        this.restClient = OutboundHttp.restClient(OutboundHttp.OPENAI_READ_TIMEOUT);
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model == null || model.isBlank() ? "gpt-4o-mini" : model.trim();
    }

    /** False when no key is configured, in which case the caller keeps the template. */
    public boolean available() {
        return !apiKey.isEmpty();
    }

    public String model() {
        return model;
    }

    /**
     * @return the explanation, or null when one could not be produced -- no key,
     *     a refused or malformed response, a timeout. Null means "use the
     *     template"; it never means "tell the owner something went wrong",
     *     because a record they can already read in full is not an error.
     */
    public Explanation explain(Facts facts) {
        if (!available()) {
            return null;
        }

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("model", model);
        request.put("temperature", 0.2);
        request.put("max_completion_tokens", MAX_COMPLETION_TOKENS);
        request.put("response_format", responseSchema());
        request.put("messages", List.of(
                Map.of("role", "system", "content", SYSTEM_PROMPT),
                Map.of("role", "user", "content", facts.asPrompt())
        ));

        try {
            Explanation explanation = request(request);
            if (explanation == null) {
                return null;
            }
            if (!usesFirstPerson(explanation)) {
                return explanation;
            }

            /* One correction, then the template. Asking twice is worth a second
               call; asking three times is paying to argue with a model. */
            log.info("Explanation used first person; asking once for a rewrite");
            List<Map<String, Object>> messages = new ArrayList<>();
            messages.add(Map.of("role", "system", "content", SYSTEM_PROMPT));
            messages.add(Map.of("role", "user", "content", facts.asPrompt()));
            messages.add(Map.of("role", "assistant", "content", explanation.whatWasDone()));
            messages.add(Map.of("role", "user", "content", CORRECTION));
            request.put("messages", messages);

            Explanation second = request(request);
            if (second != null && !usesFirstPerson(second)) {
                return second;
            }

            log.warn("Explanation still used first person after a rewrite; using the template");
            return null;
        } catch (Exception failure) {
            // One record failing to be explained is not worth an error page, and
            // the template below it says the same things less well.
            log.warn("Explanation model call failed ({}); falling back to the template",
                    failure.getClass().getSimpleName());
            return null;
        }
    }

    private Explanation request(Map<String, Object> request) throws Exception {
        String body = restClient.post()
                .uri(OPENAI_CHAT_COMPLETIONS_URL)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(String.class);
        return parse(body);
    }

    /**
     * Whether an explanation speaks as though Trevora did the work.
     *
     * <p>Whole words only, so "Vios" keeps its i and "focus" keeps its us.
     */
    static boolean usesFirstPerson(Explanation explanation) {
        if (explanation == null) {
            return false;
        }
        List<String> everything = new ArrayList<>(explanation.watchFor());
        everything.add(explanation.whatWasDone());
        everything.add(explanation.whyItMatters());
        return everything.stream()
                .filter(text -> text != null && !text.isBlank())
                .anyMatch(text -> FIRST_PERSON.matcher(text).find());
    }

    private Explanation parse(String body) throws Exception {
        JsonNode root = objectMapper.readTree(body);
        String content = root.path("choices").path(0).path("message").path("content").asText("");
        if (content.isBlank()) {
            return null;
        }

        JsonNode parsed = objectMapper.readTree(content);
        String whatWasDone = parsed.path("whatWasDone").asText("").trim();
        String whyItMatters = parsed.path("whyItMatters").asText("").trim();
        if (whatWasDone.isEmpty() || whyItMatters.isEmpty()) {
            return null;
        }

        List<String> watchFor = new ArrayList<>();
        for (JsonNode item : parsed.path("watchFor")) {
            String value = item.asText("").trim();
            if (!value.isEmpty()) {
                watchFor.add(value);
            }
        }

        return new Explanation(whatWasDone, whyItMatters, List.copyOf(watchFor));
    }

    private static Map<String, Object> responseSchema() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("whatWasDone", Map.of("type", "string"));
        properties.put("whyItMatters", Map.of("type", "string"));
        properties.put("watchFor", Map.of(
                "type", "array",
                "items", Map.of("type", "string"),
                "maxItems", 3
        ));

        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", List.of("whatWasDone", "whyItMatters", "watchFor"));
        schema.put("additionalProperties", false);

        return Map.of(
                "type", "json_schema",
                "json_schema", Map.of("name", "service_explanation", "strict", true, "schema", schema)
        );
    }

    /** What the model is told. Every field is optional; absent ones are omitted
        rather than sent as "unknown", so the model is never invited to fill a
        gap the record leaves open. */
    public record Facts(
            String vehicle,
            String serviceTypes,
            List<String> partsFitted,
            List<String> materialsUsed,
            List<String> workPerformed,
            String shop,
            String date,
            String odometer,
            String totalCost,
            String remarks
    ) {
        String asPrompt() {
            StringBuilder text = new StringBuilder("Facts recorded for this visit:\n");
            line(text, "Vehicle", vehicle);
            line(text, "Service", serviceTypes);
            list(text, "Parts fitted", partsFitted);
            list(text, "Materials and consumables", materialsUsed);
            list(text, "Work performed", workPerformed);
            line(text, "Shop", shop);
            line(text, "Date", date);
            line(text, "Odometer", odometer);
            line(text, "Total recorded cost", totalCost);
            line(text, "Owner's remarks on the record", remarks);
            return text.toString();
        }

        private static void line(StringBuilder text, String label, String value) {
            if (value != null && !value.isBlank()) {
                text.append("- ").append(label).append(": ").append(value.trim()).append('\n');
            }
        }

        private static void list(StringBuilder text, String label, List<String> values) {
            if (values != null && !values.isEmpty()) {
                text.append("- ").append(label).append(": ").append(String.join("; ", values)).append('\n');
            }
        }
    }

    public record Explanation(String whatWasDone, String whyItMatters, List<String> watchFor) {
    }
}
