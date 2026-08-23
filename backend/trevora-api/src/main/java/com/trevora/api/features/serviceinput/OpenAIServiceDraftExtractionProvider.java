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
    /** Pesos of slack before a lines-versus-total gap is worth reporting: VAT rounding. */
    private static final BigDecimal RECONCILE_TOLERANCE = new BigDecimal("1.00");

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
        return extractFields(rawOcrText, VehicleContext.UNKNOWN);
    }

    /**
     * @param vehicle what the system already knows about the vehicle. Used to
     *     disambiguate wording and to choose the component vocabulary the model
     *     is allowed to answer from; never a source of extracted values.
     */
    public ReceiptDraftFields extractFields(String rawOcrText, VehicleContext vehicle) {
        if (apiKey == null) {
            throw new ReceiptProcessingException("OpenAI extraction is enabled but OPENAI_API_KEY is not configured.");
        }

        VehicleContext context = vehicle == null ? VehicleContext.UNKNOWN : vehicle;
        return requestExtraction(
                systemPrompt(context),
                context.toPromptBlock() + "\nOCR text:\n" + truncate(rawOcrText, MAX_OCR_CHARS),
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
            reconcile(services, totalCost, warnings);
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

    private String systemPrompt(VehicleContext vehicle) {
        return """
                You are a vehicle service record extraction specialist for service center receipts, invoices, job orders, and official receipts.
                Use only the OCR text and page/source metadata. Do not use outside knowledge.

                A vehicle description is given above the OCR text. It is context for interpretation
                only and is NEVER a source of extracted values. Do not copy the make, model, year,
                plate number or odometer from it into any field: if the receipt does not print a
                value, that value is missing, no matter what the vehicle block says.

                Use the vehicle for four things and nothing else:
                1. Disambiguating wording. "CVT" is a transmission on a car and the drive unit on a
                   scooter or motorcycle. "Chain and sprocket", "roller", "pulley" and "belt" are
                   drivetrain on a motorcycle. A motorcycle has no air conditioning, so "AC" on a
                   motorcycle receipt is almost certainly an OCR error or an unrelated line.
                2. Choosing relatedComponents from the list below, which is already narrowed to the
                   components this class of vehicle actually has.
                3. Judging whether an odometer reading is plausible. Odometers only increase. A
                   reading below the vehicle's last recorded odometer, or implausibly far above it,
                   should still be extracted as printed but must carry a warning.
                4. Noticing that the receipt may not belong to this vehicle at all. If the receipt
                   prints a plate number, make or model that clearly conflicts with the vehicle
                   above, extract what the receipt says and add a warning naming the conflict. Do
                   not silently correct either one.
                Return strict JSON only. Do not include markdown or explanation.

                The OCR text preserves the printed layout where it could be recovered. Each line of
                the text is one row as it was printed on the paper, and a vertical bar separates
                columns within that row. So "REPLACE CONDENSER | 350.00" is a single printed row whose
                description column reads REPLACE CONDENSER and whose amount column reads 350.00, and
                the amount belongs to that line and no other. Use this: it is the difference between
                knowing which price goes with which line and guessing.
                A row may have one column or several. Some receipts recover no layout at all and
                arrive as plain reading order; when there are no bars, fall back to reading the text
                as prose and say so in a warning if line amounts become uncertain.

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

                LINE ENTRIES - the most important part of this task.

                Every printed, itemised line on the receipt must appear exactly once in the
                "lineEntries" array of the service it belongs to. A line is one of exactly four kinds,
                and getting the kind right matters more than getting the wording right:

                OPERATION - labour the shop performed. Verbs and job names: "REPLACE CONDENSER",
                  "PAINTING JOB", "SRA/FIX", "CHANGE OIL", "WHEEL ALIGNMENT", "CBWS".
                  This is the ONLY kind that says which part of the vehicle was worked on.
                PART - a component fitted to the vehicle and still on it when it leaves:
                  "CONDENSER", "OIL FILTER", "BRAKE PAD SET", "FLOORMAT", "PLASTIC COVER SET".
                MATERIAL - consumed doing the work, not part of the vehicle: paint, thinner,
                  masking tape, masking paper, degreaser, rubbing compound, body filler, waste pads,
                  rags, cleaning cloths, sandpaper, sealant.
                FEE - charged but neither: shop supplies, disposal, towing, diagnostic fee,
                  environmental charge, handling.

                Why the distinction matters: a body-and-paint invoice bills a painting job, a floor mat,
                and eleven consumables including a waste pad. Read as one undifferentiated list, "WASTE
                PAD" looks like brake work and the owner is shown a brake service that never happened.
                Materials and fees are evidence of cost only. They never indicate a serviced component.

                The same noun often appears twice, once as a part and once as the labour of fitting it.
                "CONDENSER 150.00" and "REPLACE CONDENSER 350.00" are two separate lines, one PART and
                one OPERATION. Do not merge them and do not drop either.

                When you cannot tell which kind a line is, choose MATERIAL. It is the kind that claims
                least: guessing PART adds a component the vehicle may not have, and guessing OPERATION
                lets the line be attributed to a part of the vehicle on no evidence.

                COMPLETENESS. Every itemised, priced line printed on the receipt must appear in
                exactly one service's lineEntries. Before returning, count the lineEntries across all
                services and compare that count against the number of priced lines on the receipt.
                They must be equal. A dropped line is money the owner paid that the record will not
                show, and it makes the totals impossible to reconcile.

                The grouping into services is a convenience; the lines are the record. Never drop a
                line because it does not fit the service you chose to create. Receipts commonly list
                all the parts together first and all the labour together afterwards, so a service
                built around one operation will have parts sitting outside it - attach them to the
                service they belong to rather than discarding them.

                When in doubt, return FEWER services. One service holding every line is always
                acceptable and is the right answer whenever the receipt is not clearly divided into
                separate jobs. Splitting a receipt into one service per operation and losing the
                part lines is the worst outcome available.

                Do not drop a line because its wording overlaps another line: a receipt billing
                "CONDENSER 150.00" and "REPLACE CONDENSER 350.00" has two lines, one PART and one
                OPERATION, and both must be returned.

                Most receipts print one amount per line, with no separate quantity and unit-price
                columns. When a line shows a single amount, that amount is the lineTotal. Leave
                unitPrice null unless the receipt actually prints a unit price and a quantity as
                separate figures. "CONDENSER 150.00" is lineTotal 150.00 with a null unitPrice and a
                null quantity - not a unit price of 150.00.

                Line prices are factual values and the no-invention rule applies to them in full.
                Copy quantity, unitPrice and lineTotal only when the number is clearly associated with
                that line in the OCR text. Receipts are printed as tables, and OCR often separates a
                column of prices from the descriptions they belong to - when that has happened and you
                cannot tell which price belongs to which line, return null for those numbers and add a
                warning. Guessing an amount is worse than omitting it.

                Every lineEntries object must have exactly these keys:
                kind, description, partCode, quantity, unitPrice, lineTotal.
                description is the printed text of the line, cleaned of column noise but not reworded.
                partCode is the shop's own code for the line when one is printed
                (Toyota OPERATION CODE/PART NO. values such as 72990-YZA12 or TTY-DEGREASER),
                otherwise null.
                quantity, unitPrice and lineTotal are numeric or null.
                If the receipt has no itemised lines at all, return an empty lineEntries array.

                Also return "lineCost" per service: the subtotal for that one service when the receipt
                prints one, otherwise null. Do not compute it yourself.

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
                Classification relatedComponents must use only these values, which are the
                components a %s has:
                %s.
                Values outside this list are rejected. If the best word for something is not on the
                list, choose the closest listed component and say so in classification notes rather
                than inventing a label.
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
                serviceType, partsReplaced, laborPerformed, lineCost, lineEntries.
                partsReplaced and laborPerformed are legacy summary fields kept for older records;
                fill them in as before, but lineEntries is the authoritative breakdown and a
                consumable must never be summarised into partsReplaced.
                classification must be an object with exactly these keys:
                normalizedServiceType, serviceCategory, relatedComponents, recordTags,
                confidence, source, needsOwnerReview, notes.
                classification.confidence must be high, medium, or low.
                classification.source must be AI.
                confidenceNotes must be an array of short user-safe notes about uncertain, inferred, conflicting, or missing fields.
                fieldConfidence must map every field name to high, medium, low, or not_found.
                aiSuggestedFields must list field names whose sourceType is INFERRED_FROM_TEXT or EXTRACTED_AND_SUMMARIZED.
                warnings must be an array of short user-safe notes about conflicts or limitations.
                """.formatted(
                vehicle.isMotorcycle() ? "motorcycle" : "car",
                String.join(", ", vehicle.allowedComponents()));
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
                serviceType, partsReplaced, laborPerformed, lineCost, lineEntries.
                partsReplaced and laborPerformed are legacy summary fields kept for older records;
                fill them in as before, but lineEntries is the authoritative breakdown and a
                consumable must never be summarised into partsReplaced.
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

    /**
     * Checks the extraction against itself.
     *
     * <p>A receipt carries its own checksum: the itemised lines sum to the
     * printed total, and when they do not, something was dropped or misread.
     * This is the one accuracy signal available without knowing the right
     * answer, and it costs a subtraction.
     *
     * <p>It catches the failures that are otherwise invisible. Google Vision
     * drops blocks below its confidence threshold, silently removing a line and
     * its cost. OCR turns a printed 350.00 into "350.&#162;" and the line comes
     * back unpriced. A misread digit turns 1,450.00 into 145.00, which looks
     * perfectly plausible on its own and is obvious against a total.
     *
     * <p>Deliberately a warning rather than a correction. The gap says one of
     * the two figures is wrong, not which, and quietly rewriting the total to
     * match the lines would be inventing a value — the thing this pipeline is
     * least allowed to do. The owner sees the discrepancy and decides.
     */
    private void reconcile(List<ServiceItemFields> services, BigDecimal totalCost, List<String> warnings) {
        if (services == null || services.isEmpty() || totalCost == null) {
            return;
        }
        List<BigDecimal> priced = services.stream()
                .flatMap(service -> service.lineEntriesOrEmpty().stream())
                .map(ServiceLineEntryFields::lineTotal)
                .filter(java.util.Objects::nonNull)
                .toList();
        if (priced.isEmpty()) {
            return;
        }

        BigDecimal sum = priced.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal gap = sum.subtract(totalCost).abs();
        if (gap.compareTo(RECONCILE_TOLERANCE) <= 0) {
            return;
        }
        warnings.add(String.format(
                "The %d itemised lines add up to %s but the receipt total reads %s, a difference of %s."
                        + " One of the two was misread - check the lines against the receipt before confirming.",
                priced.size(), sum.toPlainString(), totalCost.toPlainString(), gap.toPlainString()));
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
                    asLineEntries(itemNode.get("lineEntries")),
                    null
            ));
        }
        return services;
    }

    /**
     * The itemised lines of one service.
     *
     * <p>Until this existed the pipeline passed {@code List.of()} here and every
     * receipt-created draft saved zero line entries, which left migration
     * {@code 011} — the schema, the backfill and the whole operation-only
     * attribution rule — reachable from manual entry and nothing else.
     *
     * <p>A line with no description is dropped rather than kept: it cannot be
     * matched, attributed or shown to anyone, and an unlabelled row on a
     * receipt breakdown is worse than a missing one. The kind is resolved
     * through {@link ServiceLineKind#fromNullable}, which defaults anything
     * unrecognised to MATERIAL — the kind that claims least.
     */
    private List<ServiceLineEntryFields> asLineEntries(JsonNode node) {
        List<ServiceLineEntryFields> entries = new ArrayList<>();
        if (node == null || node.isNull() || !node.isArray()) {
            return entries;
        }
        for (JsonNode entryNode : node) {
            String description = asText(entryNode.get("description"));
            if (description == null) {
                continue;
            }
            entries.add(new ServiceLineEntryFields(
                    ServiceLineKind.fromNullable(asText(entryNode.get("kind"))).name(),
                    description,
                    asText(entryNode.get("partCode")),
                    asBigDecimal(entryNode.get("quantity")),
                    asBigDecimal(entryNode.get("unitPrice")),
                    asBigDecimal(entryNode.get("lineTotal"))
            ));
        }
        return entries;
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
