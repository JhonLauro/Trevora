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

        try {
            Map<String, Object> request = new LinkedHashMap<>();
            request.put("model", model);
            request.put("temperature", 0);
            request.put("response_format", Map.of("type", "json_object"));
            request.put("messages", List.of(
                    Map.of(
                            "role", "system",
                            "content", systemPrompt()
                    ),
                    Map.of(
                            "role", "user",
                            "content", "OCR text:\n" + truncate(rawOcrText, MAX_OCR_CHARS)
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
            throw new ReceiptProcessingException("OpenAI extraction failed with HTTP status " + exception.getStatusCode().value() + ".", exception);
        } catch (RestClientException exception) {
            throw new ReceiptProcessingException("OpenAI extraction request failed.", exception);
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
                    asStringList(fieldsNode.get("confidenceNotes"))
            );
        } catch (JsonProcessingException exception) {
            throw new ReceiptProcessingException("OpenAI extraction returned invalid JSON.", exception);
        }
    }

    private String systemPrompt() {
        return """
                You extract vehicle service receipt data from OCR text.
                Use only the OCR text. Do not invent missing values.
                Return JSON only. Do not include markdown.
                Missing fields must be null.
                Dates should be ISO format yyyy-MM-dd when possible.
                totalCost should be numeric when possible.
                odometer should be numeric when possible.
                Return exactly these keys:
                serviceDate, serviceType, odometer, totalCost, shopName, location,
                partsReplaced, laborPerformed, remarks, confidenceNotes.
                confidenceNotes must be an array of short strings about uncertain or missing fields.
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
