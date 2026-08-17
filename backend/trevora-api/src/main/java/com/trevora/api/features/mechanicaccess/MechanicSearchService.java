package com.trevora.api.features.mechanicaccess;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.shared.exception.AccessRequestException;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import com.trevora.api.features.servicerecord.ServiceRecordItemRepository;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
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

    private final MechanicAccessService mechanicAccessService;
    private final ServiceRecordItemRepository serviceRecordItemRepository;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final String apiKey;
    private final String model;

    public MechanicSearchService(
            MechanicAccessService mechanicAccessService,
            ServiceRecordItemRepository serviceRecordItemRepository,
            ObjectMapper objectMapper,
            @Value("${trevora.ai.openai.api-key:}") String apiKey,
            @Value("${trevora.mechanic-search.openai.model:gpt-4o}") String model
    ) {
        this.mechanicAccessService = mechanicAccessService;
        this.serviceRecordItemRepository = serviceRecordItemRepository;
        this.objectMapper = objectMapper;
        this.restClient = RestClient.create();
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
        MechanicSearchDecision decision = aiDecision(normalizedQuery, records).orElseGet(() -> fallbackDecision(normalizedQuery, records));
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

    private java.util.Optional<MechanicSearchDecision> aiDecision(String query, List<ServiceRecord> records) {
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
                    Map.of("role", "user", "content", mechanicSearchUserPrompt(query, records))
            ));

            String responseBody = restClient.post()
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

    private MechanicSearchDecision fallbackDecision(String query, List<ServiceRecord> records) {
        List<ServiceRecord> matches = findMatches(records, query);
        return new MechanicSearchDecision(
                answerFor(query, matches),
                fallbackRecommendedView(query),
                matches.stream().map(ServiceRecord::getRecordId).toList(),
                "KEYWORD_FALLBACK"
        );
    }

    private List<ServiceRecord> findMatches(List<ServiceRecord> records, String query) {
        String lowerQuery = query.toLowerCase(Locale.ROOT);
        if (containsAny(lowerQuery, "latest", "most recent", "last service", "recent service")) {
            return records.stream().limit(1).toList();
        }
        return records.stream()
                .filter(record -> matches(record, itemsFor(record), lowerQuery))
                .toList();
    }

    private List<ServiceRecordItem> itemsFor(ServiceRecord record) {
        return serviceRecordItemRepository.findByRecordIdOrderBySortOrder(record.getRecordId());
    }

    private boolean matches(ServiceRecord record, List<ServiceRecordItem> items, String lowercaseQuery) {
        boolean itemMatch = items.stream().anyMatch(item ->
                containsIgnoreCase(item.getServiceType(), lowercaseQuery)
                        || containsIgnoreCase(item.getPartsReplaced(), lowercaseQuery)
                        || containsIgnoreCase(item.getLaborPerformed(), lowercaseQuery)
        );
        return itemMatch
                || containsIgnoreCase(record.getShopName(), lowercaseQuery)
                || containsIgnoreCase(record.getRemarks(), lowercaseQuery)
                || semanticMatch(items, lowercaseQuery);
    }

    private boolean semanticMatch(List<ServiceRecordItem> items, String lowercaseQuery) {
        String searchable = items.stream()
                .flatMap(item -> java.util.stream.Stream.of(
                        valueOrEmpty(item.getServiceType()),
                        valueOrEmpty(item.getPartsReplaced()),
                        valueOrEmpty(item.getLaborPerformed())
                ))
                .reduce("", (a, b) -> a + " " + b)
                .toLowerCase(Locale.ROOT);

        if (containsAny(lowercaseQuery, "oil", "filter")) {
            return containsAny(searchable, "oil", "filter");
        }
        if (containsAny(lowercaseQuery, "brake", "stopping")) {
            return containsAny(searchable, "brake", "pad", "rotor");
        }
        if (containsAny(lowercaseQuery, "battery", "start", "electrical")) {
            return containsAny(searchable, "battery", "alternator", "electrical");
        }
        if (containsAny(lowercaseQuery, "tire", "tyre", "wheel")) {
            return containsAny(searchable, "tire", "tyre", "wheel", "alignment");
        }
        return false;
    }

    private String answerFor(String query, List<ServiceRecord> matches) {
        if (matches.isEmpty()) {
            return "No approved shared records matched \"" + query + "\".";
        }

        ServiceRecord first = matches.get(0);
        String serviceLabel = serviceLabelFor(first);
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
                + " approved shared records. The most recent match is "
                + serviceLabel
                + " on "
                + date
                + " at "
                + shop
                + ".";
    }

    private String serviceLabelFor(ServiceRecord record) {
        List<ServiceRecordItem> items = itemsFor(record);
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

    private String mechanicSearchUserPrompt(String query, List<ServiceRecord> records) throws JsonProcessingException {
        List<Map<String, Object>> summaries = records.stream()
                .limit(40)
                .map(this::recordSummary)
                .toList();
        return "Mechanic question:\n"
                + query
                + "\n\nApproved shared records JSON:\n"
                + objectMapper.writeValueAsString(summaries);
    }

    private Map<String, Object> recordSummary(ServiceRecord record) {
        List<ServiceRecordItem> items = itemsFor(record);
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
