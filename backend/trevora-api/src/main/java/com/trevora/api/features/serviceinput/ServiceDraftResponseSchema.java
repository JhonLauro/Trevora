package com.trevora.api.features.serviceinput;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The JSON Schema the extraction response is required to match.
 *
 * <p>{@code response_format: json_object} only guarantees that the reply parses
 * as JSON. It says nothing about shape, so a missing key read straight through
 * {@code fieldsNode.get(...)} as null and became an absent value in a draft —
 * indistinguishable from a receipt that genuinely did not print one. Sending
 * this schema with {@code strict: true} makes the shape a constraint on
 * decoding rather than something to hope for: the wrong shape cannot be
 * returned, so it does not have to be detected.
 *
 * <p>Strict mode is narrower than JSON Schema. Every property must be listed in
 * {@code required} — optionality is expressed by allowing null — and every
 * object must set {@code additionalProperties: false}. That rules out
 * open-ended maps, which is why {@code fieldSources} and {@code fieldConfidence}
 * name their fields explicitly here and in the prompt. They are the visit-level
 * factual fields, which is exactly the set the parser reads back: per-service
 * evidence had nowhere to go in a flat map once a receipt held more than one
 * service.
 *
 * <p>Two variants, because the two callers genuinely differ: a receipt records
 * evidence as an object per field, while a voice transcript is a single source
 * and records the string {@code "voice transcript"}.
 */
final class ServiceDraftResponseSchema {

    /**
     * The fields carrying per-field evidence. Visit-level and factual: the ones
     * {@code isInferredFactualValue} can blank out, plus remarks.
     */
    private static final List<String> EVIDENCE_FIELDS =
            List.of("serviceDate", "odometer", "totalCost", "shopName", "location", "remarks");

    private static final List<String> CONFIDENCE_VALUES = List.of("high", "medium", "low", "not_found");

    private ServiceDraftResponseSchema() {
    }

    /** The {@code response_format} value for receipt extraction. */
    static Map<String, Object> forReceipt() {
        return responseFormat("receipt_service_draft", evidenceObject());
    }

    /** The {@code response_format} value for voice extraction. */
    static Map<String, Object> forVoice() {
        return responseFormat("voice_service_draft", nullable("string"));
    }

    /** The evidence field names, so the prompt and the schema cannot drift apart. */
    static String evidenceFieldList() {
        return String.join(", ", EVIDENCE_FIELDS);
    }

    private static Map<String, Object> responseFormat(String name, Map<String, Object> evidenceValue) {
        return Map.of(
                "type", "json_schema",
                "json_schema", Map.of(
                        "name", name,
                        "strict", true,
                        "schema", draftSchema(evidenceValue)
                )
        );
    }

    private static Map<String, Object> draftSchema(Map<String, Object> evidenceValue) {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("serviceDate", nullable("string"));
        properties.put("services", array(serviceSchema()));
        properties.put("odometer", nullable("integer"));
        properties.put("totalCost", nullable("number"));
        properties.put("shopName", nullable("string"));
        properties.put("location", nullable("string"));
        properties.put("remarks", nullable("string"));
        properties.put("classification", classificationSchema());
        properties.put("confidenceNotes", array(Map.of("type", "string")));
        properties.put("fieldSources", fixedKeyMap(evidenceValue));
        properties.put("fieldConfidence", fixedKeyMap(nullableEnum(CONFIDENCE_VALUES)));
        properties.put("aiSuggestedFields", array(Map.of("type", "string")));
        properties.put("warnings", array(Map.of("type", "string")));
        return object(properties);
    }

    private static Map<String, Object> serviceSchema() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("serviceType", nullable("string"));
        properties.put("partsReplaced", nullable("string"));
        properties.put("laborPerformed", nullable("string"));
        properties.put("lineCost", nullable("number"));
        properties.put("lineEntries", array(lineEntrySchema()));
        return object(properties);
    }

    private static Map<String, Object> lineEntrySchema() {
        Map<String, Object> properties = new LinkedHashMap<>();
        // Not nullable: every printed line is one of the four kinds, and the
        // prompt already names MATERIAL as the answer when it is not obvious.
        properties.put("kind", Map.of(
                "type", "string",
                "enum", List.of("OPERATION", "PART", "MATERIAL", "FEE")));
        properties.put("description", nullable("string"));
        properties.put("partCode", nullable("string"));
        properties.put("quantity", nullable("number"));
        properties.put("unitPrice", nullable("number"));
        properties.put("lineTotal", nullable("number"));
        return object(properties);
    }

    private static Map<String, Object> classificationSchema() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("normalizedServiceType", nullable("string"));
        // The allowed values live in the prompt rather than here: the component
        // vocabulary depends on the vehicle, and a category list duplicated in
        // two places is a list that will disagree with itself.
        properties.put("serviceCategory", nullable("string"));
        properties.put("relatedComponents", array(Map.of("type", "string")));
        properties.put("recordTags", array(Map.of("type", "string")));
        properties.put("confidence", nullableEnum(List.of("high", "medium", "low")));
        properties.put("source", nullable("string"));
        properties.put("needsOwnerReview", nullable("boolean"));
        properties.put("notes", array(Map.of("type", "string")));
        Map<String, Object> schema = new LinkedHashMap<>(object(properties));
        schema.put("type", List.of("object", "null"));
        return schema;
    }

    private static Map<String, Object> fixedKeyMap(Map<String, Object> valueSchema) {
        Map<String, Object> properties = new LinkedHashMap<>();
        EVIDENCE_FIELDS.forEach(field -> properties.put(field, valueSchema));
        return object(properties);
    }

    private static Map<String, Object> evidenceObject() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("value", nullable("string"));
        properties.put("confidence", nullableEnum(CONFIDENCE_VALUES));
        properties.put("sourceType", nullableEnum(List.of(
                "EXTRACTED_FROM_TEXT", "INFERRED_FROM_TEXT", "EXTRACTED_AND_SUMMARIZED",
                "NOT_FOUND", "CONFLICTING")));
        properties.put("sourceText", nullable("string"));
        properties.put("pageNumber", nullable("integer"));
        properties.put("needsReview", nullable("boolean"));
        Map<String, Object> schema = new LinkedHashMap<>(object(properties));
        schema.put("type", List.of("object", "null"));
        return schema;
    }

    /** An object with every property required and nothing else permitted. */
    private static Map<String, Object> object(Map<String, Object> properties) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", new ArrayList<>(properties.keySet()));
        schema.put("additionalProperties", false);
        return schema;
    }

    private static Map<String, Object> array(Map<String, Object> items) {
        return Map.of("type", "array", "items", items);
    }

    private static Map<String, Object> nullable(String type) {
        return Map.of("type", List.of(type, "null"));
    }

    private static Map<String, Object> nullableEnum(List<String> values) {
        List<String> withNull = new ArrayList<>(values);
        withNull.add(null);
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", List.of("string", "null"));
        schema.put("enum", withNull);
        return schema;
    }
}
