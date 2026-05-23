package com.trevora.api.features.serviceinput;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Service
public class OpenAIServiceDraftExtractionProvider {
    private static final String OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
    private static final int MAX_OCR_CHARS = 12000;
    private static final int MAX_VOICE_TRANSCRIPT_CHARS = 8000;

    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final String apiKey;
    private final String model;

    public OpenAIServiceDraftExtractionProvider(
            ObjectMapper objectMapper,
            @Value("${trevora.ai.openai.api-key:}") String apiKey,
            @Value("${trevora.ai.openai.model:gpt-4o-mini}") String model
    ) {
        this.objectMapper = objectMapper;
        this.restClient = RestClient.create();
        this.apiKey = blankToNull(apiKey);
        this.model = blankToDefault(model, "gpt-4o-mini");
    }

    public ReceiptDraftFields extractFields(String rawOcrText) {
        if (apiKey == null) {
            throw new ReceiptProcessingException("OpenAI extraction is enabled but OPENAI_API_KEY is not configured.");
        }

        return requestExtraction(
                systemPrompt(),
                "OCR text:\n" + truncate(rawOcrText, MAX_OCR_CHARS),
                "OpenAI extraction"
        );
    }

    public ReceiptDraftFields extractVoiceFields(String transcript) {
        if (apiKey == null) {
            throw new ReceiptProcessingException("OpenAI voice extraction is enabled but OPENAI_API_KEY is not configured.");
        }
        if (transcript == null || transcript.isBlank()) {
            throw new ReceiptProcessingException("Voice transcript is required before structured extraction.");
        }

        return requestExtraction(
                voiceSystemPrompt(),
                "Voice transcript:\n" + truncate(transcript, MAX_VOICE_TRANSCRIPT_CHARS),
                "OpenAI voice extraction"
        );
    }

    private ReceiptDraftFields requestExtraction(String systemPrompt, String userContent, String operationLabel) {
        try {
            Map<String, Object> request = new LinkedHashMap<>();
            request.put("model", model);
            request.put("temperature", 0);
            request.put("response_format", Map.of("type", "json_object"));
            request.put("messages", List.of(
                    Map.of(
                            "role", "system",
                            "content", systemPrompt
                    ),
                    Map.of(
                            "role", "user",
                            "content", userContent
                    )
            ));

            String responseBody = restClient.post()
                    .uri(OPENAI_CHAT_COMPLETIONS_URL)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(String.class);

            return parseOpenAIResponse(responseBody);
        } catch (RestClientResponseException exception) {
            throw new ReceiptProcessingException(operationLabel + " failed with HTTP status " + exception.getStatusCode().value() + ".", exception);
        } catch (RestClientException exception) {
            throw new ReceiptProcessingException(operationLabel + " request failed.", exception);
        }
    }

    public String model() {
        return model;
    }

    private ReceiptDraftFields parseOpenAIResponse(String responseBody) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode contentNode = root.path("choices").path(0).path("message").path("content");
            if (contentNode.isMissingNode() || contentNode.asText().isBlank()) {
                throw new ReceiptProcessingException("OpenAI extraction returned no JSON content.");
            }

            JsonNode fieldsNode = objectMapper.readTree(stripMarkdownFence(contentNode.asText()));
            return new ReceiptDraftFields(
                    asDate(fieldsNode.get("serviceDate")),
                    asText(fieldsNode.get("serviceType")),
                    asInteger(fieldsNode.get("odometer")),
                    asBigDecimal(fieldsNode.get("totalCost")),
                    asText(fieldsNode.get("shopName")),
                    asText(fieldsNode.get("location")),
                    asText(fieldsNode.get("partsReplaced")),
                    asText(fieldsNode.get("laborPerformed")),
                    asText(fieldsNode.get("remarks")),
                    asStringList(fieldsNode.get("confidenceNotes")),
                    asStringMap(fieldsNode.get("fieldSources"))
            );
        } catch (JsonProcessingException exception) {
            throw new ReceiptProcessingException("OpenAI extraction returned invalid JSON.", exception);
        }
    }

    private String systemPrompt() {
        return """
                You are a vehicle service record extraction specialist.
                Use only the OCR text and page/source metadata. Do not invent missing values.
                Return strict JSON only. Do not include markdown or explanation.
                Missing or uncertain fields must be null.
                If pages conflict, choose the clearest supported value and add a confidence note.
                Dates should be ISO format yyyy-MM-dd when possible.
                totalCost should be numeric when possible.
                odometer should be numeric when possible.
                Return exactly these keys:
                serviceDate, serviceType, odometer, totalCost, shopName, location,
                partsReplaced, laborPerformed, remarks, confidenceNotes, fieldSources.
                confidenceNotes must be an array of short strings about uncertain or missing fields.
                fieldSources must be an object mapping extracted field names to page/source labels such as "PAGE 1 - UPLOAD - receipt.jpg".
                """;
    }

    private String voiceSystemPrompt() {
        return """
                You are a vehicle service record extraction specialist for spoken owner notes.
                Use only the voice transcript. Do not invent missing values.
                Return strict JSON only. Do not include markdown or explanation.
                Missing, unrelated, or uncertain fields must be null.
                If the transcript is casual conversation or not about a vehicle service event, return null for all service fields.
                Extract a field only when the transcript clearly supports it.
                Dates should be ISO format yyyy-MM-dd when possible.
                totalCost should be numeric when possible.
                odometer should be numeric when possible.
                Return exactly these keys:
                serviceDate, serviceType, odometer, totalCost, shopName, location,
                partsReplaced, laborPerformed, remarks, confidenceNotes, fieldSources.
                confidenceNotes must be an array of short strings about uncertain or missing fields.
                fieldSources must be an object mapping extracted field names to "voice transcript".
                """;
    }

    private LocalDate asDate(JsonNode node) {
        String value = asText(node);
        if (value == null) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private Integer asInteger(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            return node.intValue();
        }
        String value = asText(node);
        if (value == null) {
            return null;
        }
        String digits = value.replaceAll("[^0-9]", "");
        if (digits.isBlank()) {
            return null;
        }
        try {
            return Integer.parseInt(digits);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private BigDecimal asBigDecimal(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            return node.decimalValue();
        }
        String value = asText(node);
        if (value == null) {
            return null;
        }
        String normalized = value.replaceAll("[^0-9.\\-]", "");
        if (normalized.isBlank() || ".".equals(normalized) || "-".equals(normalized)) {
            return null;
        }
        try {
            return new BigDecimal(normalized);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private String asText(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        String value = node.isTextual() ? node.asText() : node.toString();
        if (value.isBlank() || "null".equalsIgnoreCase(value)) {
            return null;
        }
        return value.trim();
    }

    private List<String> asStringList(JsonNode node) {
        if (node == null || node.isNull()) {
            return List.of();
        }
        if (node.isArray()) {
            List<String> values = objectMapper.convertValue(
                    node,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, String.class)
            );
            return values.stream().filter(value -> value != null && !value.isBlank()).map(String::trim).toList();
        }
        String value = asText(node);
        return value == null ? List.of() : List.of(value);
    }

    private Map<String, String> asStringMap(JsonNode node) {
        if (node == null || node.isNull() || !node.isObject()) {
            return Map.of();
        }
        Map<String, String> values = new LinkedHashMap<>();
        node.fields().forEachRemaining(entry -> {
            String value = asText(entry.getValue());
            if (value != null) {
                values.put(entry.getKey(), value);
            }
        });
        return values;
    }

    private String stripMarkdownFence(String value) {
        String trimmed = value.trim();
        if (!trimmed.startsWith("```")) {
            return trimmed;
        }
        int firstNewline = trimmed.indexOf('\n');
        int lastFence = trimmed.lastIndexOf("```");
        if (firstNewline >= 0 && lastFence > firstNewline) {
            return trimmed.substring(firstNewline + 1, lastFence).trim();
        }
        return trimmed;
    }

    private String truncate(String value, int maxChars) {
        if (value == null || value.length() <= maxChars) {
            return value;
        }
        return value.substring(0, maxChars);
    }

    private String blankToDefault(String value, String fallback) {
        String normalized = blankToNull(value);
        return normalized == null ? fallback : normalized;
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
