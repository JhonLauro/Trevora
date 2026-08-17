package com.trevora.api.features.serviceinput;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
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
            List<ServiceItemFields> services = asServiceItems(fieldsNode.get("services"));
            Map<String, Object> fieldSources = asObjectMap(fieldsNode.get("fieldSources"));
            Map<String, String> fieldConfidence = fieldConfidence(fieldsNode.get("fieldConfidence"), fieldSources);
            List<String> aiSuggestedFields = aiSuggestedFields(fieldsNode.get("aiSuggestedFields"), fieldSources);
            List<String> warnings = new ArrayList<>(asStringList(fieldsNode.get("warnings")));
            LocalDate serviceDate = asDate(fieldsNode.get("serviceDate"));
            Integer odometer = asInteger(fieldsNode.get("odometer"));
            BigDecimal totalCost = asBigDecimal(fieldsNode.get("totalCost"));
            String shopName = asText(fieldsNode.get("shopName"));
            String location = asText(fieldsNode.get("location"));
            if (isInferredFactualValue(fieldSources, "serviceDate")) {
                serviceDate = null;
                warnings.add("Service date was not directly supported by receipt text and was left blank.");
            }
            if (isInferredFactualValue(fieldSources, "odometer")) {
                odometer = null;
                warnings.add("Odometer was not directly supported by receipt text and was left blank.");
            }
            if (isInferredFactualValue(fieldSources, "totalCost")) {
                totalCost = null;
                warnings.add("Total cost was not directly supported by receipt text and was left blank.");
            }
            if (isInferredFactualValue(fieldSources, "shopName")) {
                shopName = null;
                warnings.add("Shop name was not directly supported by receipt text and was left blank.");
            }
            if (isInferredFactualValue(fieldSources, "location")) {
                location = null;
                warnings.add("Location was not directly supported by receipt text and was left blank.");
            }
            return new ReceiptDraftFields(
                    serviceDate,
                    services,
                    odometer,
                    totalCost,
                    shopName,
                    location,
                    asText(fieldsNode.get("remarks")),
                    asStringList(fieldsNode.get("confidenceNotes")),
                    fieldSources,
                    fieldConfidence,
                    aiSuggestedFields,
                    classification(fieldsNode.get("classification")),
                    warnings
            );
        } catch (JsonProcessingException exception) {
            throw new ReceiptProcessingException("OpenAI extraction returned invalid JSON.", exception);
        }
    }

    private String systemPrompt() {
        return """
                You are a vehicle service record extraction specialist for service center receipts, invoices, job orders, and official receipts.
                Use only the OCR text and page/source metadata. Do not use outside knowledge.
                Return strict JSON only. Do not include markdown or explanation.

                Receipts come from many different shops with no fixed layout. The OCR text may still contain
                content that is not part of the service transaction itself. Ignore the following entirely -
                do not copy it into any field, do not let it influence classification, and do not mention it
                in confidenceNotes or warnings unless it is directly conflicting with a real field value:
                - Barcodes, QR code strings, or long alphanumeric codes with no surrounding label or context.
                - Marketing slogans, promotions, loyalty program text, social media handles or hashtags.
                - Generic greetings or sign-offs ("Thank you for your business", "Please come again").
                - Printed legal boilerplate, warranty disclaimers, or terms-and-conditions paragraphs.
                - Tax registration numbers, business permit numbers, or accreditation numbers that are not the total cost.
                - Cashier names, queue numbers, or POS system metadata unrelated to the vehicle or service.
                Example: OCR text containing "Follow us @shopname for promos!" or "All sales are final, see terms
                on back" must not appear in remarks, partsReplaced, laborPerformed, or any other field.
                When in doubt whether a line is transaction content or boilerplate, prefer leaving it out rather
                than including it in a field or in confidenceNotes/warnings.

                Factual values must be directly supported by visible OCR text. Do not invent or infer factual values.
                Factual values include serviceDate, totalCost, odometer, shopName, location, plateNumber, VIN, and chassis number.
                If a factual value is missing or uncertain, return null for that field.
                If multiple possible factual values exist, choose the clearest source-supported value only and add a warning.

                A single visit/receipt can include multiple distinct services (for example an oil change
                and a tire rotation on the same receipt). Return each distinct service performed as a
                separate entry in the "services" array, each with its own serviceType, partsReplaced,
                and laborPerformed. If only one service was performed, return a single-entry array.
                If the receipt truly has no identifiable services, return an empty array.

                You may classify or infer these per-service fields from OCR text:
                serviceType, laborPerformed, partsReplaced.
                Also infer the visit-level "remarks" field (notes that are not specific to one service).
                These inferred or summarized values must be labeled as AI-suggested with sourceType INFERRED_FROM_TEXT or EXTRACTED_AND_SUMMARIZED, confidence medium or low unless the source text is explicit, and needsReview true.

                Field-level evidence is required for every returned field, including missing fields.
                Each fieldSources entry must be an object with:
                value, confidence, sourceType, sourceText, pageNumber, needsReview.
                confidence must be one of high, medium, low, not_found.
                sourceType must be one of EXTRACTED_FROM_TEXT, INFERRED_FROM_TEXT, EXTRACTED_AND_SUMMARIZED, NOT_FOUND, CONFLICTING.
                sourceText must be the shortest useful OCR snippet supporting the value, or null when not found.
                pageNumber must be a number when identifiable, otherwise null.
                needsReview must be true for inferred, summarized, low-confidence, not_found, or conflicting fields.

                Dates should be ISO format yyyy-MM-dd when possible.
                totalCost should be numeric when possible.
                odometer should be numeric when possible.
                Classification must use only these serviceCategory values:
                Maintenance, Repair, Inspection, Replacement, Warranty, Emergency, Other.
                Classification relatedComponents must use only these values:
                Engine, Engine Oil, Oil Filter, Brakes, Tires, Battery, Air Filter,
                Transmission, Cooling System, Suspension, Lights, AC System,
                Electrical, Body, Fluids, Other.
                You may infer classification labels from serviceType, partsReplaced,
                laborPerformed, remarks, and OCR text. Do not invent factual values.
                Mark inferred classification as AI-suggested and set needsOwnerReview true.
                Add classification notes when serviceType is inferred from labor/parts,
                multiple components are detected, confidence is medium or low,
                source documents are multi-page, or classification is uncertain.

                Return exactly these keys:
                serviceDate, services, odometer, totalCost, shopName, location,
                remarks, classification, confidenceNotes, fieldSources,
                fieldConfidence, aiSuggestedFields, warnings.
                services must be an array of objects, each with exactly these keys:
                serviceType, partsReplaced, laborPerformed.
                classification must be an object with exactly these keys:
                normalizedServiceType, serviceCategory, relatedComponents, recordTags,
                confidence, source, needsOwnerReview, notes.
                classification.confidence must be high, medium, or low.
                classification.source must be AI.
                confidenceNotes must be an array of short user-safe notes about uncertain, inferred, conflicting, or missing fields.
                fieldConfidence must map every field name to high, medium, low, or not_found.
                aiSuggestedFields must list field names whose sourceType is INFERRED_FROM_TEXT or EXTRACTED_AND_SUMMARIZED.
                warnings must be an array of short user-safe notes about conflicts or limitations.
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
                A single spoken description can mention multiple distinct services (for example an oil
                change and a tire rotation in the same visit). Return each distinct service performed as
                a separate entry in the "services" array, each with its own serviceType, partsReplaced,
                and laborPerformed. If only one service was mentioned, return a single-entry array. If no
                service is clearly described, return an empty array.
                serviceType should be a concise service label only when a service is explicitly described.
                shopName should capture a named repair shop, garage, service center, dealership, or auto shop only when the speaker explicitly names it.
                Examples of explicit support include phrases like "at Superior Auto Repairs", "from Midas", "the shop name is Quick Fix Motors", or "serviced at Toyota Service Center".
                Return null for shopName when the transcript only says a generic mechanic, technician, or shop without a specific business name.
                partsReplaced should include only explicit parts, attributed to the correct service entry.
                laborPerformed should include only explicit work performed, attributed to the correct service entry.
                remarks should include only explicit visit-level notes that do not fit another field.
                Classification must use only these serviceCategory values:
                Maintenance, Repair, Inspection, Replacement, Warranty, Emergency, Other.
                Classification relatedComponents must use only these values:
                Engine, Engine Oil, Oil Filter, Brakes, Tires, Battery, Air Filter,
                Transmission, Cooling System, Suspension, Lights, AC System,
                Electrical, Body, Fluids, Other.
                You may infer classification labels from the transcript, serviceType,
                partsReplaced, laborPerformed, and remarks. Do not invent factual values.
                Mark inferred classification as AI-suggested and set needsOwnerReview true.

                Return exactly these keys:
                serviceDate, services, odometer, totalCost, shopName, location,
                remarks, classification, confidenceNotes, fieldSources,
                fieldConfidence, aiSuggestedFields, warnings.
                services must be an array of objects, each with exactly these keys:
                serviceType, partsReplaced, laborPerformed.
                classification must be an object with exactly these keys:
                normalizedServiceType, serviceCategory, relatedComponents, recordTags,
                confidence, source, needsOwnerReview, notes.
                classification.confidence must be high, medium, or low.
                classification.source must be AI.
                confidenceNotes must be an array of short strings about uncertain, missing, or unrelated fields.
                fieldSources must be an object mapping extracted field names to "voice transcript".
                fieldConfidence must map field names to high, medium, low, or not_found.
                aiSuggestedFields and warnings must be arrays.
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

    private List<ServiceItemFields> asServiceItems(JsonNode node) {
        List<ServiceItemFields> services = new ArrayList<>();
        if (node == null || node.isNull() || !node.isArray()) {
            return services;
        }
        for (JsonNode itemNode : node) {
            String serviceType = asText(itemNode.get("serviceType"));
            if (serviceType == null) {
                continue;
            }
            services.add(new ServiceItemFields(
                    serviceType,
                    asText(itemNode.get("partsReplaced")),
                    asText(itemNode.get("laborPerformed")),
                    asBigDecimal(itemNode.get("lineCost")),
                    null
            ));
        }
        return services;
    }

    private Map<String, Object> asObjectMap(JsonNode node) {
        if (node == null || node.isNull() || !node.isObject()) {
            return Map.of();
        }
        Map<String, Object> values = objectMapper.convertValue(
                node,
                objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class)
        );
        return values == null ? Map.of() : values;
    }

    private Map<String, String> fieldConfidence(JsonNode node, Map<String, Object> fieldSources) {
        Map<String, String> values = new LinkedHashMap<>();
        if (node != null && node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                String confidence = normalizeConfidence(asText(entry.getValue()));
                if (confidence != null) {
                    values.put(entry.getKey(), confidence);
                }
            });
        }
        fieldSources.forEach((fieldName, evidence) -> {
            if (values.containsKey(fieldName) || !(evidence instanceof Map<?, ?> evidenceMap)) {
                return;
            }
            String confidence = normalizeConfidence(evidenceMap.get("confidence") == null ? null : String.valueOf(evidenceMap.get("confidence")));
            if (confidence != null) {
                values.put(fieldName, confidence);
            }
        });
        return values;
    }

    private List<String> aiSuggestedFields(JsonNode node, Map<String, Object> fieldSources) {
        List<String> values = new ArrayList<>(asStringList(node));
        fieldSources.forEach((fieldName, evidence) -> {
            if (!(evidence instanceof Map<?, ?> evidenceMap) || values.contains(fieldName)) {
                return;
            }
            String sourceType = evidenceMap.get("sourceType") == null ? "" : String.valueOf(evidenceMap.get("sourceType"));
            if ("INFERRED_FROM_TEXT".equalsIgnoreCase(sourceType) || "EXTRACTED_AND_SUMMARIZED".equalsIgnoreCase(sourceType)) {
                values.add(fieldName);
            }
        });
        return values;
    }

    private ServiceClassification classification(JsonNode node) {
        if (node == null || node.isNull() || !node.isObject()) {
            return null;
        }
        return new ServiceClassification(
                asText(node.get("normalizedServiceType")),
                asText(node.get("serviceCategory")),
                asStringList(node.get("relatedComponents")),
                asStringList(node.get("recordTags")),
                asText(node.get("confidence")),
                asText(node.get("source")),
                asStringList(node.get("notes")),
                node.has("needsOwnerReview") && node.get("needsOwnerReview").asBoolean(true)
        );
    }

    private String normalizeConfidence(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim().toLowerCase();
        return switch (normalized) {
            case "high", "medium", "low", "not_found" -> normalized;
            default -> null;
        };
    }

    private boolean isInferredFactualValue(Map<String, Object> fieldSources, String fieldName) {
        Object evidence = fieldSources.get(fieldName);
        if (!(evidence instanceof Map<?, ?> evidenceMap)) {
            return false;
        }
        Object sourceTypeNode = evidenceMap.get("sourceType");
        if (sourceTypeNode == null) {
            return false;
        }
        String sourceType = String.valueOf(sourceTypeNode);
        return "INFERRED_FROM_TEXT".equalsIgnoreCase(sourceType)
                || "EXTRACTED_AND_SUMMARIZED".equalsIgnoreCase(sourceType);
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
