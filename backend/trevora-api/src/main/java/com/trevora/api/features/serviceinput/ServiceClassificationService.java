package com.trevora.api.features.serviceinput;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class ServiceClassificationService {
    public static final List<String> ALLOWED_SERVICE_CATEGORIES = List.of(
            "Maintenance",
            "Repair",
            "Inspection",
            "Replacement",
            "Warranty",
            "Emergency",
            "Other"
    );
    public static final List<String> ALLOWED_RELATED_COMPONENTS = List.of(
            "Engine",
            "Engine Oil",
            "Oil Filter",
            "Brakes",
            "Tires",
            "Battery",
            "Air Filter",
            "Transmission",
            "Cooling System",
            "Suspension",
            "Lights",
            "AC System",
            "Electrical",
            "Body",
            "Fluids",
            "Other"
    );

    private static final Map<String, String> CATEGORY_LOOKUP = lookup(ALLOWED_SERVICE_CATEGORIES);
    private static final Map<String, String> COMPONENT_LOOKUP = lookup(ALLOWED_RELATED_COMPONENTS);
    private static final List<KeywordRule> KEYWORD_RULES = List.of(
            new KeywordRule("\\b(oil|engine oil|oil filter)\\b", "Maintenance", List.of("Engine Oil", "Oil Filter", "Engine"), "Oil Change & Filter"),
            new KeywordRule("\\b(brake|brakes|brake pad|brake fluid|rotor|caliper)\\b", "Repair", List.of("Brakes"), "Brake Service"),
            new KeywordRule("\\b(tire|tyre|wheel|alignment|rotation|balanc)\\b", "Maintenance", List.of("Tires", "Suspension"), "Tire / Wheel Service"),
            new KeywordRule("\\bbattery\\b", "Replacement", List.of("Battery", "Electrical"), "Battery Service"),
            new KeywordRule("\\b(coolant|radiator|cooling|thermostat)\\b", "Maintenance", List.of("Cooling System", "Fluids"), "Cooling System Service"),
            new KeywordRule("\\b(air filter|cabin filter)\\b", "Replacement", List.of("Air Filter", "AC System"), "Filter Replacement"),
            new KeywordRule("\\b(transmission|atf|clutch|cvt)\\b", "Maintenance", List.of("Transmission"), "Transmission Service"),
            new KeywordRule("\\b(light|headlight|tail light|taillight|bulb|signal)\\b", "Replacement", List.of("Lights", "Electrical"), "Lights Service"),
            new KeywordRule("\\b(suspension|shock|strut)\\b", "Repair", List.of("Suspension"), "Suspension Service"),
            new KeywordRule("\\b(ac|a/c|aircon|freon|cabin)\\b", "Maintenance", List.of("AC System"), "AC System Service"),
            new KeywordRule("\\b(body|paint|bumper|door|panel)\\b", "Repair", List.of("Body"), "Body Repair")
    );

    public ServiceClassification classifyAiOrFallback(
            ServiceClassification aiClassification,
            String rawText,
            String serviceType,
            String partsReplaced,
            String laborPerformed,
            String remarks,
            int pageCount
    ) {
        ServiceClassification fallback = keywordFallback(rawText, serviceType, partsReplaced, laborPerformed, remarks, pageCount);
        if (aiClassification == null) {
            return fallback;
        }

        List<String> notes = new ArrayList<>(safeList(aiClassification.notes()));
        String serviceCategory = normalizeCategory(aiClassification.serviceCategory());
        String confidence = normalizeConfidence(aiClassification.confidence());
        String source = normalizeSource(aiClassification.source(), "AI");
        List<String> relatedComponents = normalizeComponents(aiClassification.relatedComponents());
        boolean mixed = false;

        if (serviceCategory == null) {
            serviceCategory = "Other";
            notes.add("AI returned a category outside the controlled list; category was set to Other.");
        }
        if (relatedComponents.isEmpty()) {
            relatedComponents = fallback.relatedComponents();
            mixed = !relatedComponents.isEmpty();
            notes.add("Related components were filled by keyword fallback because AI returned none or invalid values.");
        }
        if (relatedComponents.isEmpty()) {
            relatedComponents = List.of("Other");
        }
        if (confidence == null) {
            confidence = pageCount > 1 ? "medium" : "low";
            notes.add("Classification confidence was missing and was estimated from source context.");
        }
        if (pageCount > 1) {
            notes.add("Source document has multiple pages; owner review is recommended.");
        }
        String normalizedServiceType = blankToNull(aiClassification.normalizedServiceType());
        if (normalizedServiceType == null) {
            normalizedServiceType = fallback.normalizedServiceType();
            if (normalizedServiceType != null && blankToNull(serviceType) == null) {
                notes.add("Service type was inferred from labor, parts, or notes.");
            }
        }
        if (relatedComponents.size() > 1) {
            notes.add("Multiple related components were detected.");
        }
        if (!"high".equals(confidence)) {
            notes.add("Classification confidence is " + confidence + "; owner review is recommended.");
        }

        return new ServiceClassification(
                normalizedServiceType,
                serviceCategory,
                relatedComponents,
                sanitizeTags(aiClassification.recordTags(), serviceCategory, relatedComponents),
                confidence,
                mixed && "AI".equals(source) ? "MIXED" : source,
                distinct(notes),
                true
        );
    }

    public ServiceClassification keywordFallback(
            String rawText,
            String serviceType,
            String partsReplaced,
            String laborPerformed,
            String remarks,
            int pageCount
    ) {
        String haystack = String.join(" ",
                safe(rawText),
                safe(serviceType),
                safe(partsReplaced),
                safe(laborPerformed),
                safe(remarks)
        ).toLowerCase(Locale.ROOT);

        Set<String> components = new LinkedHashSet<>();
        String category = null;
        String normalizedServiceType = blankToNull(serviceType);
        for (KeywordRule rule : KEYWORD_RULES) {
            if (!rule.pattern().matcher(haystack).find()) {
                continue;
            }
            components.addAll(rule.components());
            if (category == null) {
                category = rule.category();
            }
            if (normalizedServiceType == null) {
                normalizedServiceType = rule.normalizedServiceType();
            }
        }

        if (category == null) {
            category = categoryFromGeneralKeywords(haystack);
        }
        if (components.isEmpty() && !haystack.isBlank()) {
            components.add("Other");
        }

        String confidence = components.isEmpty() ? "low" : "medium";
        List<String> notes = new ArrayList<>();
        notes.add("Classification used controlled keyword fallback.");
        if (pageCount > 1) {
            notes.add("Source document has multiple pages; owner review is recommended.");
        }
        if (components.size() > 1) {
            notes.add("Multiple related components were detected.");
        }

        return new ServiceClassification(
                normalizedServiceType,
                category,
                components.isEmpty() ? List.of() : List.copyOf(components),
                sanitizeTags(List.of(), category, List.copyOf(components)),
                confidence,
                "KEYWORD_FALLBACK",
                distinct(notes),
                true
        );
    }

    private String categoryFromGeneralKeywords(String haystack) {
        if (contains(haystack, "warranty")) return "Warranty";
        if (contains(haystack, "inspection", "inspect", "diagnostic")) return "Inspection";
        if (contains(haystack, "emergency", "tow", "breakdown", "overheat")) return "Emergency";
        if (contains(haystack, "replace", "replacement", "install")) return "Replacement";
        if (contains(haystack, "repair", "fixed", "restore")) return "Repair";
        if (contains(haystack, "maintenance", "pms", "change", "alignment", "rotation")) return "Maintenance";
        return "Other";
    }

    private static boolean contains(String haystack, String... needles) {
        for (String needle : needles) {
            if (haystack.contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private String normalizeCategory(String value) {
        if (value == null) {
            return null;
        }
        return CATEGORY_LOOKUP.get(value.trim().toLowerCase(Locale.ROOT));
    }

    private List<String> normalizeComponents(List<String> values) {
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String value : safeList(values)) {
            String component = COMPONENT_LOOKUP.get(value.trim().toLowerCase(Locale.ROOT));
            if (component != null) {
                normalized.add(component);
            }
        }
        return List.copyOf(normalized);
    }

    private String normalizeConfidence(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "high", "medium", "low" -> normalized;
            default -> null;
        };
    }

    private String normalizeSource(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "AI", "KEYWORD_FALLBACK", "MANUAL", "MIXED" -> normalized;
            default -> fallback;
        };
    }

    private List<String> sanitizeTags(List<String> tags, String category, List<String> relatedComponents) {
        LinkedHashSet<String> sanitized = new LinkedHashSet<>();
        for (String tag : safeList(tags)) {
            String normalized = tag.trim().replaceAll("[^A-Za-z0-9 _/-]", "");
            if (!normalized.isBlank()) {
                sanitized.add(normalized);
            }
        }
        if (category != null && !"Other".equals(category)) {
            sanitized.add(category);
        }
        sanitized.addAll(relatedComponents);
        return sanitized.stream().limit(10).toList();
    }

    private static Map<String, String> lookup(List<String> values) {
        Map<String, String> lookup = new LinkedHashMap<>();
        values.forEach(value -> lookup.put(value.toLowerCase(Locale.ROOT), value));
        return lookup;
    }

    private List<String> distinct(List<String> values) {
        LinkedHashSet<String> distinct = new LinkedHashSet<>();
        values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .forEach(distinct::add);
        return List.copyOf(distinct);
    }

    private List<String> safeList(List<String> values) {
        return values == null ? List.of() : values;
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private record KeywordRule(
            Pattern pattern,
            String category,
            List<String> components,
            String normalizedServiceType
    ) {
        KeywordRule(String pattern, String category, List<String> components, String normalizedServiceType) {
            this(Pattern.compile(pattern, Pattern.CASE_INSENSITIVE), category, components, normalizedServiceType);
        }
    }
}
