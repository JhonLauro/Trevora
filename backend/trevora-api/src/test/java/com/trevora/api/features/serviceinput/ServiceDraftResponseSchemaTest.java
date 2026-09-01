package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Guards the rules OpenAI enforces on a {@code strict: true} schema.
 *
 * <p>A schema that breaks them is rejected with a 400 at request time, which in
 * this pipeline surfaces as the raw-OCR fallback — a draft with no fields, for a
 * reason that has nothing to do with the receipt. Cheaper to catch here.
 */
class ServiceDraftResponseSchemaTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void receiptSchemaSatisfiesStrictModeRules() {
        assertStrict(ServiceDraftResponseSchema.forReceipt());
    }

    @Test
    void voiceSchemaSatisfiesStrictModeRules() {
        assertStrict(ServiceDraftResponseSchema.forVoice());
    }

    @Test
    void receiptSchemaDeclaresTheKeysTheParserReadsBack() {
        JsonNode root = schemaRoot(ServiceDraftResponseSchema.forReceipt());

        assertThat(fieldNames(root.path("properties"))).containsExactlyInAnyOrder(
                "documentType", "documentNumber", "referenceNumbers",
                "serviceDate", "services", "odometer", "totalCost", "shopName", "location",
                "remarks", "classification", "confidenceNotes", "fieldSources",
                "fieldConfidence", "aiSuggestedFields", "warnings");

        // Not nullable, and closed. Every document is one of these and
        // SERVICE_INVOICE is the answer when nothing else is proven, so there
        // is no case where a null would be more honest than the default.
        JsonNode documentType = root.path("properties").path("documentType");
        assertThat(documentType.path("type").asText()).isEqualTo("string");
        assertThat(documentType.path("enum"))
                .extracting(JsonNode::asText)
                .containsExactly("SERVICE_INVOICE", "OFFICIAL_RECEIPT", "ESTIMATE",
                        "WORK_PERFORMED", "PARTS_SLIP", "PARTS_PURCHASE", "INSPECTION_REPORT",
                        "NOT_A_RECEIPT");

        JsonNode lineEntry = root.path("properties").path("services").path("items")
                .path("properties").path("lineEntries").path("items");
        assertThat(fieldNames(lineEntry.path("properties"))).containsExactlyInAnyOrder(
                "kind", "description", "partCode", "quantity", "unitPrice", "lineTotal");
        assertThat(lineEntry.path("properties").path("kind").path("enum"))
                .extracting(JsonNode::asText)
                .containsExactly("OPERATION", "PART", "MATERIAL", "FEE");
    }

    /** The prompt names the evidence fields; drift between the two is silent. */
    @Test
    void evidenceFieldListMatchesTheSchemasFixedKeys() {
        JsonNode root = schemaRoot(ServiceDraftResponseSchema.forReceipt());
        List<String> advertised = List.of(ServiceDraftResponseSchema.evidenceFieldList().split(", "));

        assertThat(fieldNames(root.path("properties").path("fieldSources").path("properties")))
                .containsExactlyElementsOf(advertised);
        assertThat(fieldNames(root.path("properties").path("fieldConfidence").path("properties")))
                .containsExactlyElementsOf(advertised);
    }

    private void assertStrict(Map<String, Object> responseFormat) {
        assertThat(responseFormat).containsEntry("type", "json_schema");
        JsonNode jsonSchema = objectMapper.valueToTree(responseFormat).path("json_schema");
        assertThat(jsonSchema.path("strict").asBoolean()).isTrue();
        assertThat(jsonSchema.path("name").asText()).isNotBlank();
        assertObjectsAreClosed(jsonSchema.path("schema"), "schema");
    }

    /**
     * Every object node must forbid extra properties and require every property
     * it declares. Optionality is expressed by allowing null, never by omission.
     */
    private void assertObjectsAreClosed(JsonNode node, String path) {
        if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                assertObjectsAreClosed(node.get(i), path + "[" + i + "]");
            }
            return;
        }
        if (!node.isObject()) {
            return;
        }
        if (declaresType(node, "object")) {
            assertThat(node.path("additionalProperties").isBoolean())
                    .as("%s must set additionalProperties", path)
                    .isTrue();
            assertThat(node.path("additionalProperties").asBoolean())
                    .as("%s must set additionalProperties to false", path)
                    .isFalse();
            assertThat(fieldNames(node.path("required")))
                    .as("%s must require every declared property", path)
                    .containsExactlyInAnyOrderElementsOf(fieldNames(node.path("properties")));
        }
        node.fields().forEachRemaining(entry ->
                assertObjectsAreClosed(entry.getValue(), path + "." + entry.getKey()));
    }

    private boolean declaresType(JsonNode node, String type) {
        JsonNode declared = node.path("type");
        if (declared.isTextual()) {
            return type.equals(declared.asText());
        }
        for (JsonNode candidate : declared) {
            if (type.equals(candidate.asText())) {
                return true;
            }
        }
        return false;
    }

    private JsonNode schemaRoot(Map<String, Object> responseFormat) {
        return objectMapper.valueToTree(responseFormat).path("json_schema").path("schema");
    }

    /** Property names of an object node, or the string values of an array node. */
    private List<String> fieldNames(JsonNode node) {
        List<String> names = new ArrayList<>();
        if (node.isArray()) {
            node.forEach(entry -> names.add(entry.asText()));
        } else {
            node.fieldNames().forEachRemaining(names::add);
        }
        return names;
    }

    /**
     * A spoken account of a visit is not a document.
     *
     * <p>Asking for its type would only invite an invented answer, and the
     * parser already defaults the field when the key is absent.
     */
    @Test
    void voiceSchemaAsksForNoDocumentFields() {
        JsonNode root = schemaRoot(ServiceDraftResponseSchema.forVoice());

        assertThat(fieldNames(root.path("properties")))
                .doesNotContain("documentType", "documentNumber", "referenceNumbers");
    }
}
