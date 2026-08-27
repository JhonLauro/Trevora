package com.trevora.api.features.mechanicaccess;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.shared.exception.AccessRequestException;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import com.trevora.api.features.servicerecord.ServiceRecordItemReader;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Service
public class MechanicSearchService {
    private static final String OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
    private static final Set<String> ALLOWED_VIEWS = Set.of("parts-map", "timeline", "table");

    /*
     * Words a mechanic types to form a question rather than to name a part.
     * Dropping them is what lets "was the clutch ever replaced?" behave like
     * "clutch" instead of matching nothing.
     */
    private static final Set<String> STOPWORDS = Set.of(
            "a", "an", "and", "any", "anything", "are", "at", "be", "been", "before", "but", "by",
            "can", "did", "do", "does", "done", "for", "from", "get", "had", "has", "have", "how",
            "i", "if", "in", "is", "it", "its", "just", "me", "my", "of", "on", "or", "show", "so",
            "that", "the", "their", "them", "there", "these", "they", "this", "to", "up", "was",
            "were", "what", "when", "where", "which", "who", "why", "will", "with", "work", "you"
    );

    /*
     * A part a mechanic asks about is rarely the word on the receipt: someone
     * asking about "brakes" wants the record that says "rotor". Each entry is
     * a family of terms that should find each other, and it is applied in both
     * directions, so any member of a family matches any other.
     *
     * This is deliberately a fixed vocabulary rather than a learned one. It is
     * the fallback path -- what runs when OpenAI is unreachable or the key is
     * unset -- so it has to be predictable and free.
     */
    private static final List<Set<String>> TERM_FAMILIES = List.of(
            Set.of("brake", "brakes", "pad", "pads", "rotor", "rotors", "caliper", "disc", "stopping"),
            Set.of("oil", "lubricant", "lube", "filter", "change"),
            Set.of("battery", "alternator", "starter", "electrical", "charging"),
            Set.of("tire", "tires", "tyre", "tyres", "wheel", "wheels", "alignment", "balancing", "rim"),
            Set.of("clutch", "transmission", "gear", "gearbox", "flywheel"),
            Set.of("coolant", "radiator", "overheat", "overheating", "thermostat", "water"),
            Set.of("suspension", "shock", "shocks", "absorber", "strut", "spring", "bushing"),
            Set.of("aircon", "ac", "air", "conditioning", "compressor", "freon", "refrigerant"),
            Set.of("engine", "motor", "piston", "valve", "timing", "belt", "spark", "plug"),
            Set.of("light", "lights", "headlight", "bulb", "lamp", "signal"),
            Set.of("tune", "tuneup", "maintenance", "pms", "service", "checkup", "inspection")
    );

    private final MechanicAccessService mechanicAccessService;
    private final ServiceRecordItemReader serviceRecordItemReader;
    private final ObjectMapper objectMapper;
    /*
     * Built on first use rather than in the constructor. Creating it eagerly
     * opened a client socket for every deployment, including the ones with no
     * API key configured that will never make a call -- and it made the class
     * impossible to construct anywhere without network access, tests included.
     */
    private RestClient restClient;
    private final String apiKey;
    private final String model;

    public MechanicSearchService(
            MechanicAccessService mechanicAccessService,
            ServiceRecordItemReader serviceRecordItemReader,
            ObjectMapper objectMapper,
            @Value("${trevora.ai.openai.api-key:}") String apiKey,
            @Value("${trevora.mechanic-search.openai.model:gpt-4o}") String model
    ) {
        this.mechanicAccessService = mechanicAccessService;
        this.serviceRecordItemReader = serviceRecordItemReader;
        this.objectMapper = objectMapper;
        this.apiKey = blankToNull(apiKey);
        this.model = blankToDefault(model, "gpt-4o");
    }

    @Transactional
    public MechanicSearchResponse searchSharedRecords(UUID sessionId, String query) {
        String normalizedQuery = normalizeQuery(query);
        if (normalizedQuery == null) {
            throw new AccessRequestException("Search query is required.");
        }

        MechanicAccessSession session = mechanicAccessService.requireActiveReadOnlySession(sessionId);
        List<ServiceRecord> records = mechanicAccessService.getSessionRecords(session);

        /*
         * Every path below needs each record's line items, and previously each
         * one fetched them on its own -- scoring, then the answer sentence,
         * then the AI prompt summaries, all calling forRecord in a loop. On a
         * forty-record history that was eighty-odd round trips for a single
         * search. ServiceRecordItemReader already exposes a batch form for
         * exactly this reason, so it is loaded once here and passed down.
         */
        Map<UUID, List<ServiceRecordItem>> itemsByRecord = serviceRecordItemReader.forRecords(
                records.stream().map(ServiceRecord::getRecordId).toList()
        );

        MechanicSearchDecision decision = aiDecision(normalizedQuery, records, itemsByRecord)
                .orElseGet(() -> fallbackDecision(normalizedQuery, records, itemsByRecord));
        Map<UUID, ServiceRecord> recordsById = records.stream()
                .collect(Collectors.toMap(ServiceRecord::getRecordId, record -> record, (first, ignored) -> first, LinkedHashMap::new));
        List<ServiceRecord> matches = decision.matchingRecordIds().stream()
                .map(recordsById::get)
                .filter(record -> record != null)
                .toList();
        List<MechanicSharedServiceRecordResponse> sharedMatches = matches.stream()
                .map(mechanicAccessService::toSharedRecord)
                .toList();
        String recommendedView = sanitizeRecommendedView(decision.recommendedView(), normalizedQuery);

        return new MechanicSearchResponse(
                session.getMechanicAccessSessionId(),
                session.getVehicleId(),
                mechanicAccessService.vehicleLabel(session.getVehicleId()),
                normalizedQuery,
                decision.answer(),
                recommendedView,
                decision.source(),
                sharedMatches.size(),
                sharedMatches,
                Instant.now()
        );
    }

    /*
     * Two threads racing here would each build a client and one would win; both
     * are usable and RestClient is thread-safe, so the race is not worth a lock.
     */
    private RestClient restClient() {
        RestClient existing = this.restClient;
        if (existing == null) {
            existing = RestClient.create();
            this.restClient = existing;
        }
        return existing;
    }

    private java.util.Optional<MechanicSearchDecision> aiDecision(
            String query, List<ServiceRecord> records, Map<UUID, List<ServiceRecordItem>> itemsByRecord) {
        if (apiKey == null || records.isEmpty()) {
            return java.util.Optional.empty();
        }
        try {
            Map<String, Object> request = new LinkedHashMap<>();
            request.put("model", model);
            request.put("temperature", 0);
            request.put("response_format", Map.of("type", "json_object"));
            request.put("messages", List.of(
                    Map.of("role", "system", "content", mechanicSearchSystemPrompt()),
                    Map.of("role", "user", "content", mechanicSearchUserPrompt(query, records, itemsByRecord))
            ));

            String responseBody = restClient().post()
                    .uri(OPENAI_CHAT_COMPLETIONS_URL)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(String.class);

            return parseAiDecision(responseBody, records);
        } catch (RestClientException | JsonProcessingException exception) {
            return java.util.Optional.empty();
        }
    }

    private java.util.Optional<MechanicSearchDecision> parseAiDecision(String responseBody, List<ServiceRecord> records) throws JsonProcessingException {
        JsonNode root = objectMapper.readTree(responseBody);
        JsonNode contentNode = root.path("choices").path(0).path("message").path("content");
        if (contentNode.isMissingNode() || contentNode.asText().isBlank()) {
            return java.util.Optional.empty();
        }

        JsonNode decisionNode = objectMapper.readTree(stripMarkdownFence(contentNode.asText()));
        Set<UUID> allowedIds = records.stream().map(ServiceRecord::getRecordId).collect(Collectors.toSet());
        List<UUID> matchingIds = new ArrayList<>();
        JsonNode idsNode = decisionNode.get("matchingRecordIds");
        if (idsNode != null && idsNode.isArray()) {
            for (JsonNode idNode : idsNode) {
                try {
                    UUID id = UUID.fromString(idNode.asText());
                    if (allowedIds.contains(id) && !matchingIds.contains(id)) {
                        matchingIds.add(id);
                    }
                } catch (IllegalArgumentException ignored) {
                    // Ignore invalid or invented ids.
                }
            }
        }
        String answer = asText(decisionNode.get("answer"));
        if (answer == null) {
            answer = matchingIds.isEmpty()
                    ? "No approved shared records matched this question."
                    : "I found " + matchingIds.size() + " approved shared record" + (matchingIds.size() == 1 ? "" : "s") + ".";
        }
        String recommendedView = sanitizeRecommendedView(asText(decisionNode.get("recommendedView")), "");
        return java.util.Optional.of(new MechanicSearchDecision(answer, recommendedView, matchingIds, "AI"));
    }

    private MechanicSearchDecision fallbackDecision(
            String query, List<ServiceRecord> records, Map<UUID, List<ServiceRecordItem>> itemsByRecord) {
        List<ServiceRecord> matches = findMatches(records, query, itemsByRecord);
        return new MechanicSearchDecision(
                answerFor(query, matches, itemsByRecord),
                fallbackRecommendedView(query),
                matches.stream().map(ServiceRecord::getRecordId).toList(),
                "KEYWORD_FALLBACK"
        );
    }

    /*
     * The fallback used to lowercase the entire question and ask whether any
     * field contained it as one substring. That works for "clutch" and fails
     * for "was the clutch replaced", because no service type contains that
     * sentence -- so the most natural way to ask a question returned nothing.
     * Anything that did work only worked through a short hardcoded list of
     * four part families.
     *
     * This scores instead. The question is split into terms, question words
     * are dropped, each surviving term is widened to its family, and records
     * are ranked by where the hits land: the service type is what the job was,
     * so it counts for more than the shop's name.
     */
    private List<ServiceRecord> findMatches(
            List<ServiceRecord> records, String query, Map<UUID, List<ServiceRecordItem>> itemsByRecord) {
        String lowerQuery = query.toLowerCase(Locale.ROOT);
        boolean wantsLatest = containsAny(lowerQuery, "latest", "most recent", "last service", "recent service");

        List<String> terms = queryTerms(lowerQuery);
        if (terms.isEmpty()) {
            // Nothing but question words -- "what happened most recently?"
            return wantsLatest ? records.stream().limit(1).toList() : List.of();
        }

        List<ScoredRecord> scored = new ArrayList<>();
        for (ServiceRecord record : records) {
            int score = scoreRecord(record, itemsFor(record, itemsByRecord), terms);
            if (score > 0) {
                scored.add(new ScoredRecord(record, score));
            }
        }

        /*
         * Best match first, and the newer record wins a tie -- on a service
         * history the recent one is nearly always the one being asked about.
         * The response preserves this order; it is the ranking.
         */
        scored.sort(Comparator
                .comparingInt(ScoredRecord::score).reversed()
                .thenComparing(entry -> entry.record().getServiceDate(),
                               Comparator.nullsLast(Comparator.reverseOrder())));

        List<ServiceRecord> ranked = scored.stream().map(ScoredRecord::record).toList();
        if (wantsLatest && !ranked.isEmpty()) {
            return ranked.subList(0, 1);
        }
        return ranked;
    }

    private List<String> queryTerms(String lowercaseQuery) {
        return Arrays.stream(lowercaseQuery.split("[^a-z0-9]+"))
                .filter(term -> term.length() > 1)
                .filter(term -> !STOPWORDS.contains(term))
                .distinct()
                .toList();
    }

    /*
     * Widen one term to every term that should find it. Membership is checked
     * in both directions, so "rotor" finds a record that says "brake" just as
     * "brake" finds one that says "rotor".
     */
    private Set<String> expand(String term) {
        Set<String> family = new java.util.LinkedHashSet<>();
        family.add(term);
        for (Set<String> candidate : TERM_FAMILIES) {
            if (candidate.contains(term)) {
                family.addAll(candidate);
            }
        }
        return family;
    }

    private int scoreRecord(ServiceRecord record, List<ServiceRecordItem> items, List<String> terms) {
        String serviceTypes = joinLower(items, ServiceRecordItem::getServiceType);
        String categories = joinLower(items, ServiceRecordItem::getServiceCategory);
        String partsAndLabor = joinLower(items, ServiceRecordItem::getPartsReplaced)
                + " " + joinLower(items, ServiceRecordItem::getLaborPerformed);
        String remarks = lower(record.getRemarks());
        String shop = lower(record.getShopName());

        int score = 0;
        for (String term : terms) {
            Set<String> family = expand(term);
            boolean exact = family.size() == 1;

            /*
             * A term the mechanic actually typed is worth more than one this
             * code inferred, so an exact hit on the service type outranks a
             * record reached only through the synonym family.
             */
            if (containsAnyOf(serviceTypes, family)) {
                score += exact ? 6 : 5;
            }
            if (containsAnyOf(categories, family)) {
                score += 4;
            }
            if (containsAnyOf(partsAndLabor, family)) {
                score += 3;
            }
            if (containsAnyOf(remarks, family)) {
                score += 2;
            }
            if (containsAnyOf(shop, family)) {
                score += 1;
            }
        }
        return score;
    }

    private String joinLower(List<ServiceRecordItem> items, java.util.function.Function<ServiceRecordItem, String> field) {
        return items.stream()
                .map(field)
                .map(this::valueOrEmpty)
                .collect(Collectors.joining(" "))
                .toLowerCase(Locale.ROOT);
    }

    private String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    private boolean containsAnyOf(String haystack, Set<String> needles) {
        if (haystack.isEmpty()) {
            return false;
        }
        for (String needle : needles) {
            if (haystack.contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private List<ServiceRecordItem> itemsFor(ServiceRecord record, Map<UUID, List<ServiceRecordItem>> itemsByRecord) {
        return itemsByRecord.getOrDefault(record.getRecordId(), List.of());
    }

    private record ScoredRecord(ServiceRecord record, int score) {
    }

    private String answerFor(
            String query, List<ServiceRecord> matches, Map<UUID, List<ServiceRecordItem>> itemsByRecord) {
        if (matches.isEmpty()) {
            return "No approved shared records matched \"" + query + "\".";
        }

        ServiceRecord first = matches.get(0);
        String serviceLabel = serviceLabelFor(itemsFor(first, itemsByRecord));
        String date = first.getServiceDate() == null
                ? "an unknown service date"
                : first.getServiceDate().format(DateTimeFormatter.ISO_LOCAL_DATE);
        String shop = first.getShopName() == null || first.getShopName().isBlank()
                ? "shop not provided"
                : first.getShopName();
        String cost = first.getTotalCost() == null ? "cost not provided" : "PHP " + first.getTotalCost();
        if (matches.size() == 1) {
            return "I found 1 approved shared record: "
                    + serviceLabel
                    + " on "
                    + date
                    + " at "
                    + shop
                    + " for "
                    + cost
                    + ".";
        }
        return "I found "
                + matches.size()
                + " approved shared records. The closest match is "
                + serviceLabel
                + " on "
                + date
                + " at "
                + shop
                + ".";
    }

    private String serviceLabelFor(List<ServiceRecordItem> items) {
        if (items.isEmpty()) {
            return "service work";
        }
        String first = items.get(0).getServiceType();
        if (items.size() == 1) {
            return first;
        }
        return first + " (+" + (items.size() - 1) + " more)";
    }

    private String mechanicSearchSystemPrompt() {
        return """
                You are Trevora's mechanic read-only service history assistant.
                Use only the provided owner-approved shared service records.
                Do not invent service facts, dates, costs, odometer readings, shop names, VINs, plate numbers, or records.
                Return strict JSON only. No markdown.

                Choose matchingRecordIds only from the provided record ids.
                If no record supports the question, return an empty matchingRecordIds array and say that no approved shared record matched.
                Keep the answer short, practical, and useful for a mechanic.
                The mechanic question may be in any language. Understand multilingual questions and answer in the same language as the question when practical.

                recommendedView must be exactly one of:
                parts-map, timeline, table.

                Choose parts-map when the question is about components, systems, parts, or affected vehicle areas.
                Choose timeline when the question asks about latest/last/recent services, dates, chronology, sequence, or what happened before/after.
                Choose table when the question asks to see records, compare records, totals, costs, sources, shops, or broad service history.

                Return exactly:
                {
                  "answer": string,
                  "recommendedView": "parts-map" | "timeline" | "table",
                  "matchingRecordIds": [string]
                }
                """;
    }

    private String mechanicSearchUserPrompt(
            String query, List<ServiceRecord> records, Map<UUID, List<ServiceRecordItem>> itemsByRecord)
            throws JsonProcessingException {
        List<Map<String, Object>> summaries = records.stream()
                .limit(40)
                .map(record -> recordSummary(record, itemsFor(record, itemsByRecord)))
                .toList();
        return "Mechanic question:\n"
                + query
                + "\n\nApproved shared records JSON:\n"
                + objectMapper.writeValueAsString(summaries);
    }

    private Map<String, Object> recordSummary(ServiceRecord record, List<ServiceRecordItem> items) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("recordId", record.getRecordId());
        summary.put("serviceDate", record.getServiceDate());
        summary.put("services", items.stream().map(this::itemSummary).toList());
        summary.put("odometer", record.getOdometer());
        summary.put("totalCost", record.getTotalCost());
        summary.put("shopName", record.getShopName());
        summary.put("location", record.getLocation());
        summary.put("remarks", record.getRemarks());
        summary.put("sourceInputMethod", record.getSourceInputMethod());
        summary.put("hasReceipt", record.getReceiptStoragePath() != null && !record.getReceiptStoragePath().isBlank());
        return summary;
    }

    private Map<String, Object> itemSummary(ServiceRecordItem item) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("serviceType", item.getServiceType());
        summary.put("serviceCategory", item.getServiceCategory());
        summary.put("partsReplaced", item.getPartsReplaced());
        summary.put("laborPerformed", item.getLaborPerformed());
        return summary;
    }

    private String sanitizeRecommendedView(String value, String query) {
        if (value != null) {
            String normalized = value.trim().toLowerCase(Locale.ROOT);
            if (ALLOWED_VIEWS.contains(normalized)) {
                return normalized;
            }
        }
        return fallbackRecommendedView(query);
    }

    private String fallbackRecommendedView(String query) {
        String text = query == null ? "" : query.toLowerCase(Locale.ROOT);
        if (containsAny(text, "table", "list", "records", "service history", "compare", "cost", "shop", "source")) {
            return "table";
        }
        if (containsAny(text, "timeline", "chronology", "recent", "latest", "last", "when", "date", "before", "after", "sequence", "order")) {
            return "timeline";
        }
        if (containsAny(text, "part", "component", "map", "engine", "oil", "filter", "brake", "tire", "wheel", "battery", "coolant", "radiator", "suspension", "light", "aircon", "a/c", "body", "paint")) {
            return "parts-map";
        }
        return "timeline";
    }

    private boolean containsIgnoreCase(String value, String lowercaseNeedle) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(lowercaseNeedle);
    }

    private boolean containsAny(String value, String... needles) {
        for (String needle : needles) {
            if (value.contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private String normalizeQuery(String query) {
        if (query == null || query.isBlank()) {
            return null;
        }
        return query.trim();
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }

    private String asText(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        String value = node.asText();
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String stripMarkdownFence(String content) {
        String trimmed = content.trim();
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

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String blankToDefault(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim();
    }

    private record MechanicSearchDecision(
            String answer,
            String recommendedView,
            List<UUID> matchingRecordIds,
            String source
    ) {
    }
}
