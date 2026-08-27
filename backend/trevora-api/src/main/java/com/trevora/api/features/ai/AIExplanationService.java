package com.trevora.api.features.ai;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.features.ai.AIExplanationResponse;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import com.trevora.api.features.servicerecord.ServiceRecordItemReader;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import java.math.BigDecimal;
import java.text.NumberFormat;
import com.trevora.api.features.serviceinput.ServiceLineKind;
import com.trevora.api.features.servicerecord.ServiceRecordLineEntry;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class AIExplanationService {
    private static final String SOURCE = "template";
    private static final String FALLBACK_SOURCE = "template_fallback";
    private static final String DISCLAIMER = "This explanation is for understanding only and does not replace professional mechanic judgment.";

    private final ServiceRecordRepository serviceRecordRepository;
    private final ServiceRecordItemReader serviceRecordItemReader;
    private final CurrentUserService currentUserService;
    private final VehicleService vehicleService;

    public AIExplanationService(
            ServiceRecordRepository serviceRecordRepository,
            ServiceRecordItemReader serviceRecordItemReader,
            CurrentUserService currentUserService,
            VehicleService vehicleService
    ) {
        this.serviceRecordRepository = serviceRecordRepository;
        this.serviceRecordItemReader = serviceRecordItemReader;
        this.currentUserService = currentUserService;
        this.vehicleService = vehicleService;
    }

    public AIExplanationResponse getExplanationForRecord(UUID recordId) {
        currentUserService.requireVehicleOwner();
        ServiceRecord record = serviceRecordRepository
                .findByRecordIdAndOwnerId(recordId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Service record was not found."));
        vehicleService.verifyVehicleBelongsToCurrentUser(record.getVehicleId());
        List<ServiceRecordItem> items = serviceRecordItemReader.forRecord(record.getRecordId());

        try {
            return generateTemplateExplanation(record, items);
        } catch (RuntimeException exception) {
            return fallbackExplanation(record);
        }
    }

    private AIExplanationResponse generateTemplateExplanation(ServiceRecord record, List<ServiceRecordItem> items) {
        String serviceSummary = valueOrDefault(serviceSummaryFor(items), "service work");
        String shop = blankToNull(record.getShopName());
        String date = formatDate(record.getServiceDate());
        // Parts and labour come from the tagged lines where a record has them,
        // so a consumed material is never announced to the owner as a part
        // fitted to their vehicle. Pre-011 records fall back to the old
        // columns, which is all they have.
        boolean tagged = hasLineEntries(items);
        List<String> parts = tagged
                ? lineEntriesOfKind(items, ServiceLineKind.PART)
                : itemFieldValues(items, ServiceRecordItem::getPartsReplaced);
        List<String> materials = tagged
                ? lineEntriesOfKind(items, ServiceLineKind.MATERIAL)
                : List.of();
        List<String> labor = tagged
                ? lineEntriesOfKind(items, ServiceLineKind.OPERATION)
                : itemFieldValues(items, ServiceRecordItem::getLaborPerformed);
        String remarks = blankToNull(record.getRemarks());

        // One sentence. Everything that used to be appended after it — parts,
        // materials, labour, cost — is structured now and travels in
        // `details`, because gluing lists into prose only forced the client to
        // pull them apart again.
        StringBuilder whatWasDone = new StringBuilder("This confirmed record shows ")
                .append(serviceSummary)
                .append(" completed on ")
                .append(date);
        if (shop != null) {
            whatWasDone.append(" at ").append(shop);
        }
        whatWasDone.append(".");

        List<AIExplanationDetail> details = new ArrayList<>();
        addDetail(details, "Parts noted", parts);
        addDetail(details, "Materials used", materials);
        addDetail(details, "Work performed", labor);
        if (record.getTotalCost() != null) {
            addDetail(details, "Total recorded cost", List.of(formatMoney(record.getTotalCost())));
        }

        String whyItMatters = buildWhyItMatters(serviceSummary, joinForMatching(parts), joinForMatching(labor));
        List<String> watchFor = buildWatchFor(items, record.getOdometer());
        if (remarks != null) {
            watchFor.add("Keep the saved remarks in mind: " + remarks);
        }

        return new AIExplanationResponse(
                record.getRecordId(),
                record.getVehicleId(),
                SOURCE,
                false,
                whatWasDone.toString(),
                List.copyOf(details),
                whyItMatters,
                watchFor,
                DISCLAIMER,
                Instant.now()
        );
    }

    private AIExplanationResponse fallbackExplanation(ServiceRecord record) {
        return new AIExplanationResponse(
                record.getRecordId(),
                record.getVehicleId(),
                FALLBACK_SOURCE,
                true,
                "This confirmed service record was saved, but the detailed explanation could not be generated right now.",
                List.of(),
                "The saved service type, cost, odometer, parts, labor, and remarks remain available in the original record details.",
                List.of("Review the original record details before making maintenance decisions.", "Ask a qualified mechanic if symptoms continue or the issue returns."),
                DISCLAIMER,
                Instant.now()
        );
    }

    private String buildWhyItMatters(String serviceType, String parts, String labor) {
        String text = String.join(" ", valueOrDefault(serviceType, ""), valueOrDefault(parts, ""), valueOrDefault(labor, ""))
                .toLowerCase(Locale.ROOT);
        if (containsAny(text, "oil", "filter")) {
            return "Oil and filter service helps keep the engine lubricated, reduces heat and friction, and can prevent sludge buildup that shortens engine life.";
        }
        if (containsAny(text, "brake", "pad", "rotor")) {
            return "Brake service matters because worn pads, rotors, or brake hardware can reduce stopping power and make the vehicle less predictable in traffic.";
        }
        if (containsAny(text, "tire", "tyre", "wheel", "alignment")) {
            return "Tire and wheel service helps maintain grip, ride comfort, fuel efficiency, and even tire wear over time.";
        }
        if (containsAny(text, "battery", "alternator", "electrical")) {
            return "Electrical and battery service helps prevent starting issues and reduces the chance of unexpected power loss while using the vehicle.";
        }
        if (containsAny(text, "inspect", "diagnostic", "check")) {
            return "Inspection and diagnostic work helps catch problems early, before they become more expensive or affect safety.";
        }
        return "Keeping this service documented helps the owner understand what was done, track recurring issues, and plan future maintenance with better context.";
    }

    private String serviceSummaryFor(List<ServiceRecordItem> items) {
        if (items == null || items.isEmpty()) {
            return null;
        }
        String joined = items.stream()
                .map(ServiceRecordItem::getServiceType)
                .filter(value -> value != null && !value.isBlank())
                .reduce((first, second) -> first + " and " + second)
                .orElse(null);
        return joined;
    }

    /**
     * Pre-011 records keep parts and labour in a single column per item, so
     * one item is one value here. The values are returned as a list rather
     * than joined with "; " — the joining was only ever for display, and the
     * client had to undo it.
     */
    private List<String> itemFieldValues(List<ServiceRecordItem> items, java.util.function.Function<ServiceRecordItem, String> extractor) {
        if (items == null || items.isEmpty()) {
            return List.of();
        }
        return items.stream()
                .map(extractor)
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .toList();
    }

    private void addDetail(List<AIExplanationDetail> details, String label, List<String> values) {
        if (values == null || values.isEmpty()) {
            return;
        }
        details.add(new AIExplanationDetail(label, values));
    }

    /**
     * `buildWhyItMatters` matches keywords over the text of the parts and
     * labour, and does not care how they are separated. One string keeps that
     * rule exactly as it was while the values travel as a list.
     */
    private String joinForMatching(List<String> values) {
        return values == null || values.isEmpty() ? null : String.join(" ", values);
    }

    /**
     * The operations only, lowercased — the sole evidence allowed to decide
     * what to advise the owner to watch for.
     *
     * Reading parts and materials too is what produced advice about squealing
     * brakes for a body-and-paint job: the materials list held a "WASTE PAD"
     * and the brake rule matched on "pad". A consumable says nothing about
     * which part of the vehicle was serviced.
     *
     * Falls back to the pre-011 labour column when an item has no line
     * entries, which is the same claim the 011 backfill made.
     */
    private String operationText(List<ServiceRecordItem> items) {
        return (items == null ? List.<ServiceRecordItem>of() : items).stream()
                .flatMap(item -> {
                    List<String> operations = item.getLineEntries().stream()
                            .filter(entry -> entry.getKind() == ServiceLineKind.OPERATION)
                            .map(ServiceRecordLineEntry::getDescription)
                            .filter(value -> value != null && !value.isBlank())
                            .toList();
                    Stream<String> labour = operations.isEmpty() && item.getLineEntries().isEmpty()
                            ? Stream.of(valueOrDefault(item.getLaborPerformed(), ""))
                            : operations.stream();
                    return Stream.concat(Stream.of(valueOrDefault(item.getServiceType(), "")), labour);
                })
                .reduce("", (a, b) -> a + " " + b)
                .toLowerCase(Locale.ROOT);
    }

    /** Lines of one kind, as values. */
    private List<String> lineEntriesOfKind(List<ServiceRecordItem> items, ServiceLineKind kind) {
        if (items == null) {
            return List.of();
        }
        return items.stream()
                .flatMap(item -> item.getLineEntries().stream())
                .filter(entry -> entry.getKind() == kind)
                .map(ServiceRecordLineEntry::getDescription)
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .toList();
    }

    private boolean hasLineEntries(List<ServiceRecordItem> items) {
        return items != null && items.stream().anyMatch(item -> !item.getLineEntries().isEmpty());
    }

    private List<String> buildWatchFor(List<ServiceRecordItem> items, Integer odometer) {
        List<String> watchFor = new ArrayList<>();
        String text = operationText(items);

        if (containsAny(text, "oil", "filter")) {
            watchFor.add(nextOilInterval(odometer));
            watchFor.add("Watch for oil leaks, burning smells, warning lights, or faster-than-usual oil loss.");
        }
        if (containsAny(text, "brake", "pad", "rotor")) {
            watchFor.add("Listen for squealing or grinding, and watch for vibration, pulling, or a soft brake pedal.");
        }
        if (containsAny(text, "tire", "tyre", "wheel", "alignment")) {
            watchFor.add("Check tire pressure and look for uneven tread wear after the service.");
        }
        if (containsAny(text, "battery", "alternator", "electrical")) {
            watchFor.add("Watch for slow starts, dim lights, or repeated battery warnings.");
        }
        if (watchFor.isEmpty()) {
            watchFor.add("Watch whether the original symptom returns after normal driving.");
            watchFor.add("Keep the receipt and record details available for the next service visit.");
        }
        return watchFor;
    }

    private String nextOilInterval(Integer odometer) {
        if (odometer == null) {
            return "Plan the next oil-related service using the interval recommended for the vehicle and oil type.";
        }
        return "Consider the next oil-related service around "
                + NumberFormat.getIntegerInstance(Locale.US).format(odometer + 5000)
                + " km, or sooner if the vehicle manual recommends it.";
    }

    private boolean containsAny(String value, String... needles) {
        for (String needle : needles) {
            if (value.contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private String formatDate(LocalDate date) {
        if (date == null) {
            return "the saved service date";
        }
        return date.format(DateTimeFormatter.ISO_LOCAL_DATE);
    }

    private String formatMoney(BigDecimal value) {
        return "PHP " + NumberFormat.getNumberInstance(Locale.US).format(value);
    }

    private String valueOrDefault(String value, String fallback) {
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
