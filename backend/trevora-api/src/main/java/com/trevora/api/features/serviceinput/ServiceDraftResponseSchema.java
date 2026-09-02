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
            List.of("serviceDate", "odometer", "totalCost", "shopName", "location", "remarks",
                    "plateNumber", "vinChassisNumber");

    private static final List<String> CONFIDENCE_VALUES = List.of("high", "medium", "low", "not_found");

    private ServiceDraftResponseSchema() {
    }

    /** The {@code response_format} value for receipt extraction. */
    static Map<String, Object> forReceipt() {
        return responseFormat("receipt_service_draft", evidenceObject(), true);
    }

    /**
     * The {@code response_format} value for voice extraction.
     *
     * <p>No document fields: a spoken account of a visit is not a document, and
     * asking for its type would only invite an invented answer. The parser
     * defaults the type when the key is absent.
     */
    static Map<String, Object> forVoice() {
        return responseFormat("voice_service_draft", nullable("string"), false);
    }

    /** The evidence field names, so the prompt and the schema cannot drift apart. */
    static String evidenceFieldList() {
        return String.join(", ", EVIDENCE_FIELDS);
    }

    private static Map<String, Object> responseFormat(
            String name, Map<String, Object> evidenceValue, boolean includeDocument) {
        return Map.of(
                "type", "json_schema",
                "json_schema", Map.of(
                        "name", name,
                        "strict", true,
                        "schema", draftSchema(evidenceValue, includeDocument)
                )
        );
    }

    private static Map<String, Object> draftSchema(Map<String, Object> evidenceValue, boolean includeDocument) {
        Map<String, Object> properties = new LinkedHashMap<>();
        if (includeDocument) {
            // First, and not nullable. What kind of paper this is decides how
            // every number below should be read - an estimate's total is a
            // forecast formatted exactly like a real one - so it is not a
            // detail to be filled in after the fact.
            properties.put("documentType", documentTypeSchema());
            properties.put("documentNumber", nullable("string"));
            properties.put("referenceNumbers", array(Map.of("type", "string")));
        }
        properties.put("serviceDate", nullable("string"));
        properties.put("services", array(serviceSchema()));
        properties.put("odometer", nullable("integer"));
        properties.put("totalCost", nullable("number"));
        properties.put("shopName", nullable("string"));
        properties.put("location", nullable("string"));
        properties.put("remarks", nullable("string"));
        /*
         * The vehicle's own identifiers, when the paper prints them.
         *
         * These are not service facts and nothing is filed under them — they
         * exist so the app can notice that a receipt names a plate or chassis
         * the owner has never recorded, and offer to fill it in. They carry
         * evidence like every other extracted field, because an offer to
         * change a vehicle profile has to be able to show where the value came
         * from.
         */
        properties.put("plateNumber", nullable("string"));
        properties.put("vinChassisNumber", nullable("string"));
        properties.put("classification", classificationSchema());
        properties.put("confidenceNotes", array(Map.of("type", "string")));
        properties.put("fieldSources", fixedKeyMap(evidenceValue));
        properties.put("fieldConfidence", fixedKeyMap(nullableEnum(CONFIDENCE_VALUES)));
        properties.put("aiSuggestedFields", array(Map.of("type", "string")));
        properties.put("warnings", array(Map.of("type", "string")));
        return object(properties);
    }

    /**
     * The document type, as a closed enum with no null option.
     *
     * <p>Deliberately not nullable. Every document is one of these, and
     * {@link DocumentType#SERVICE_INVOICE} is the answer when nothing else is
     * proven — so there is no case where "I do not know" is more honest than
     * the default, and offering null would only produce drafts with the
     * question left open.
     */
    private static Map<String, Object> documentTypeSchema() {
        List<String> values = new ArrayList<>();
        for (DocumentType type : DocumentType.values()) {
            values.add(type.name());
        }
        return Map.of("type", "string", "enum", values);
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
