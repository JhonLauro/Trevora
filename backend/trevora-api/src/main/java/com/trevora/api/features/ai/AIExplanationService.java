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
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.NumberFormat;
import com.trevora.api.features.serviceinput.DocumentType;
import com.trevora.api.features.serviceinput.ServiceLineKind;
import com.trevora.api.features.servicerecord.ServiceRecordLineEntry;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class AIExplanationService {
    private static final Logger log = LoggerFactory.getLogger(AIExplanationService.class);

    private static final String SOURCE = "template";
    private static final String FALLBACK_SOURCE = "template_fallback";
    /** Not a fallback: the correct and complete answer for a record with no work. */
    private static final String COST_ONLY_SOURCE = "cost_only";
    /* Named after what produced it, not "ai": when somebody asks why an
       explanation reads oddly, the first useful question is which model wrote
       it, and the answer should be in the response rather than in a log. */
    private static final String MODEL_SOURCE_PREFIX = "openai:";
    private static final String DISCLAIMER = "This explanation is for understanding only and does not replace professional mechanic judgment.";

    private final ServiceRecordRepository serviceRecordRepository;
    private final ServiceRecordItemReader serviceRecordItemReader;
    private final CurrentUserService currentUserService;
    private final VehicleService vehicleService;
    private final OpenAIExplanationProvider explanationProvider;
    private final ServiceRecordExplanationRepository explanationRepository;

    public AIExplanationService(
            ServiceRecordRepository serviceRecordRepository,
            ServiceRecordItemReader serviceRecordItemReader,
            CurrentUserService currentUserService,
            VehicleService vehicleService,
            OpenAIExplanationProvider explanationProvider,
            ServiceRecordExplanationRepository explanationRepository
    ) {
        this.serviceRecordRepository = serviceRecordRepository;
        this.serviceRecordItemReader = serviceRecordItemReader;
        this.currentUserService = currentUserService;
        this.vehicleService = vehicleService;
        this.explanationProvider = explanationProvider;
        this.explanationRepository = explanationRepository;
    }

    public AIExplanationResponse getExplanationForRecord(UUID recordId) {
        currentUserService.requireVehicleOwner();
        ServiceRecord record = serviceRecordRepository
                .findByRecordIdAndOwnerId(recordId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Service record was not found."));
        vehicleService.verifyVehicleBelongsToCurrentUser(record.getVehicleId());
        List<ServiceRecordItem> items = serviceRecordItemReader.forRecord(record.getRecordId());

        if (nothingToExplain(record, items)) {
            return costOnlyExplanation(record);
        }

        try {
            /* The model first, the template when it cannot answer. The template
               is not a lesser copy kept for tidiness -- it is what an owner
               reads when the key is unset, the provider is down or the response
               comes back unusable, and it has to stand on its own. */
            AIExplanationResponse generated = generateModelExplanation(record, items);
            if (generated != null) {
                return generated;
            }
            return generateTemplateExplanation(record, items);
        } catch (RuntimeException exception) {
            return fallbackExplanation(record);
        }
    }

    /**
     * Whether this record describes no work at all.
     *
     * <p>An owner can now confirm a record from an official receipt: a real
     * payment, a real date, and no statement anywhere of what was done to the
     * car. That is a legitimate history entry and it is also nothing to
     * explain.
     *
     * <p>Both paths below would answer anyway, and both answers would be wrong
     * in the way that is hardest to catch. The model, handed a Toyota
     * letterhead and 3,106.49, will write a confident paragraph about routine
     * maintenance. The template defaults its service summary to "service work"
     * and produces the same shape of sentence with no model involved. Neither
     * has been told anything about the work, because nothing on the paper said
     * anything about the work - so both would be inventing it, and an owner
     * reading a fluent paragraph has no way to tell that apart from a real
     * explanation.
     *
     * <p>Checked on the items rather than only on the document type, because
     * the honest condition is "no work recorded", whatever kind of paper it
     * came off. A record with items explains itself normally even if it came
     * from a receipt; one without has nothing to say however it arrived.
     */
    private boolean nothingToExplain(ServiceRecord record, List<ServiceRecordItem> items) {
        if (items != null && !items.isEmpty()) {
            return false;
        }
        DocumentType documentType = record.getDocumentType();
        return documentType == null || !documentType.carriesWork();
    }

    /**
     * What an owner reads when the record priced the visit and described none
     * of it.
     *
     * <p>It says plainly that the work is unknown and why, and stops. No
     * guesses about what a service at this shop for this amount probably was,
     * and no watch-for advice, which would have to be invented from the same
     * nothing. Telling someone their receipt does not say what was done is a
     * useful answer; the alternative on offer is a fluent fabrication.
     */
    private AIExplanationResponse costOnlyExplanation(ServiceRecord record) {
        return new AIExplanationResponse(
                record.getRecordId(),
                record.getVehicleId(),
                COST_ONLY_SOURCE,
                false,
                "This record came from a document that shows the payment but not the work."
                        + " The amount and the date are yours to rely on; what was actually done"
                        + " to your car is not written on it.",
                List.of(),
                "There is nothing here for us to explain without guessing, and a guess about your"
                        + " car is worth less than nothing. If you have the service invoice or job"
                        + " order for this visit, adding it will fill in the work.",
                List.of(),
                DISCLAIMER,
                Instant.now()
        );
    }

    /**
     * The model's explanation for this record: the stored one where it still
     * applies, a newly written one otherwise.
     *
     * <p>A record's facts do not change after confirmation, so the second call
     * to the model for the same record buys a differently-worded answer to the
     * same question at the same price. It is written once and kept.
     *
     * <p>The cache is read before the provider is even asked whether it is
     * available, deliberately: an explanation written last week is still the
     * best thing to show an owner today, including on a day when the API key
     * is missing and every fresh call would fall to the template.
     *
     * @return the model's explanation, or null to fall through to the template.
     */
    private AIExplanationResponse generateModelExplanation(ServiceRecord record, List<ServiceRecordItem> items) {
        boolean tagged = hasLineEntries(items);
        List<String> parts = tagged
                ? lineEntriesOfKind(items, ServiceLineKind.PART)
                : itemFieldValues(items, ServiceRecordItem::getPartsReplaced);
        List<String> materials = tagged ? lineEntriesOfKind(items, ServiceLineKind.MATERIAL) : List.of();
        List<String> labor = tagged
                ? lineEntriesOfKind(items, ServiceLineKind.OPERATION)
                : itemFieldValues(items, ServiceRecordItem::getLaborPerformed);

        OpenAIExplanationProvider.Facts facts = new OpenAIExplanationProvider.Facts(
                vehicleLabelFor(record),
                serviceSummaryFor(items),
                parts,
                materials,
                labor,
                blankToNull(record.getShopName()),
                formatDate(record.getServiceDate()),
                record.getOdometer() == null ? null : record.getOdometer() + " km",
                record.getTotalCost() == null ? null : formatMoney(record.getTotalCost()),
                blankToNull(record.getRemarks()));

        /* The details are rebuilt from the record every time and never read
           from the cache. They are the owner's own parts list and total, and a
           stored copy of a figure is a figure that can go stale silently. */
        List<AIExplanationDetail> details = buildDetails(record, parts, materials, labor);
        String fingerprint = fingerprintOf(facts);

        ServiceRecordExplanation stored = explanationRepository.findById(record.getRecordId()).orElse(null);
        if (stored != null && fingerprint.equals(stored.getFactsFingerprint())) {
            return modelResponse(
                    record,
                    stored.getModel(),
                    stored.getWhatWasDone(),
                    details,
                    stored.getWhyItMatters(),
                    stored.getWatchFor(),
                    stored.getGeneratedAt());
        }

        if (!explanationProvider.available()) {
            return null;
        }

        OpenAIExplanationProvider.Explanation explanation = explanationProvider.explain(facts);
        if (explanation == null) {
            return null;
        }

        Instant generatedAt = Instant.now();
        String model = explanationProvider.model();
        remember(record.getRecordId(), fingerprint, model, explanation, generatedAt);

        return modelResponse(
                record,
                model,
                explanation.whatWasDone(),
                details,
                explanation.whyItMatters(),
                explanation.watchFor(),
                generatedAt);
    }

    private AIExplanationResponse modelResponse(
            ServiceRecord record,
            String model,
            String whatWasDone,
            List<AIExplanationDetail> details,
            String whyItMatters,
            List<String> watchFor,
            Instant generatedAt
    ) {
        return new AIExplanationResponse(
                record.getRecordId(),
                record.getVehicleId(),
                MODEL_SOURCE_PREFIX + model,
                false,
                whatWasDone,
                List.copyOf(details),
                whyItMatters,
                List.copyOf(watchFor),
                DISCLAIMER,
                generatedAt
        );
    }

    /**
     * Stores an explanation, and never lets storing one cost the owner the
     * explanation itself.
     *
     * <p>The text has already been paid for and is already correct. A failed
     * write here means the next view pays again -- annoying, and not a reason
     * to show somebody the failure card instead of their answer.
     */
    private void remember(
            UUID recordId,
            String fingerprint,
            String model,
            OpenAIExplanationProvider.Explanation explanation,
            Instant generatedAt
    ) {
        try {
            explanationRepository.save(new ServiceRecordExplanation(
                    recordId,
                    fingerprint,
                    model,
                    explanation.whatWasDone(),
                    explanation.whyItMatters(),
                    explanation.watchFor(),
                    generatedAt));
        } catch (RuntimeException failure) {
            log.warn("Could not cache the explanation for record {} ({})",
                    recordId, failure.getClass().getSimpleName());
        }
    }

    /**
     * A fingerprint of everything the explanation was written from.
     *
     * <p>Taken over the prompt itself rather than over a list of fields, so it
     * cannot drift from what the model actually saw: change how the facts are
     * assembled and every fingerprint changes with it. Correcting a service
     * type or adding a part therefore regenerates on the next view, with
     * nothing anywhere needing to remember to clear a row.
     */
    static String fingerprintOf(OpenAIExplanationProvider.Facts facts) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest(facts.asPrompt().getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException impossible) {
            // SHA-256 is required of every Java platform.
            throw new IllegalStateException(impossible);
        }
    }

    /* The facts stay structured and stay ours. The model writes the prose; it
       does not restate the parts list or the total, because those are the
       owner's own figures and a model that retypes them can mistype them. */
    private List<AIExplanationDetail> buildDetails(
            ServiceRecord record, List<String> parts, List<String> materials, List<String> labor) {
        List<AIExplanationDetail> details = new ArrayList<>();
        addDetail(details, "Parts noted", parts);
        addDetail(details, "Materials used", materials);
        addDetail(details, "Work performed", labor);
        if (record.getTotalCost() != null) {
            addDetail(details, "Total recorded cost", List.of(formatMoney(record.getTotalCost())));
        }
        return details;
    }

    private String vehicleLabelFor(ServiceRecord record) {
        try {
            var vehicle = vehicleService.getVehicleForCurrentUser(record.getVehicleId());
            return Stream.of(
                            vehicle.getYear() == null ? null : String.valueOf(vehicle.getYear()),
                            vehicle.getMake(),
                            vehicle.getModel())
                    .filter(value -> value != null && !String.valueOf(value).isBlank())
                    .map(String::valueOf)
                    .reduce((first, second) -> first + " " + second)
                    .orElse(null);
        } catch (RuntimeException unavailable) {
            // The explanation does not need it; ownership was already checked.
            return null;
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
        StringBuilder whatWasDone = new StringBuilder("Your car had ")
                .append(serviceSummary)
                .append(" done on ")
                .append(date);
        if (shop != null) {
            whatWasDone.append(" at ").append(shop);
        }
        whatWasDone.append(".");

        List<AIExplanationDetail> details = buildDetails(record, parts, materials, labor);

        String whyItMatters = buildWhyItMatters(serviceSummary, joinForMatching(parts), joinForMatching(labor));
        List<String> watchFor = buildWatchFor(items, record.getOdometer());
        if (remarks != null) {
            watchFor.add("Worth remembering from your own notes: " + remarks);
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
                "This service is saved to your car, but we could not put together the plain-language explanation just now.",
                List.of(),
                "Everything you entered is still here — the service, the cost, the odometer, the parts and your remarks — on the record itself.",
                List.of("Have a look at the record itself before making any decisions about your car.", "Ask a mechanic you trust if the problem comes back."),
                DISCLAIMER,
                Instant.now()
        );
    }

    /**
     * The template's paragraph for a kind of work.
     *
     * <p>Matched on the service type alone, and on whole words. It used to
     * search the parts and labour text too, with bare substring matching, which
     * is how a body and paint job containing "WASTE PAD-BP" was explained to
     * its owner as brake service: "pad" appears inside "PAD-BP". A wrong
     * explanation delivered confidently is worse than the generic one at the
     * foot of this method, so the net is now deliberately narrow.
     */
    private String buildWhyItMatters(String serviceType, String parts, String labor) {
        String text = valueOrDefault(serviceType, "").toLowerCase(Locale.ROOT);
        if (containsAny(text, "oil", "filter")) {
            return "Fresh oil and a new filter keep your engine lubricated and running cooler, which is what stops sludge building up and wearing it out early.";
        }
        if (containsAny(text, "brake", "pad", "rotor")) {
            return "Your brakes are what you rely on in traffic. Worn pads, discs or hardware mean your car takes longer to stop and behaves less predictably when you need it most.";
        }
        if (containsAny(text, "tire", "tyre", "wheel", "alignment")) {
            return "Your tires are the only part of your car touching the road. Looking after them keeps your grip, your ride comfort and your fuel use where they should be, and helps the tires wear evenly.";
        }
        if (containsAny(text, "battery", "alternator", "electrical")) {
            return "This is the work that decides whether your car starts when you turn the key. Keeping it in good order lowers the chance of being left somewhere with no power.";
        }
        if (containsAny(text, "inspect", "diagnostic", "check")) {
            return "Having your car looked over catches small problems while they are still small, before they cost more or start affecting how safely it drives.";
        }
        return "Having this written down means you can see what was already done to your car, spot anything that keeps coming back, and plan the next visit knowing its history.";
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
            watchFor.add("Keep an eye out for oil spots where you park, a burning smell, warning lights, or the oil dropping faster than usual.");
        }
        if (containsAny(text, "brake", "pad", "rotor")) {
            watchFor.add("Listen for squealing or grinding when you brake, and notice any vibration, pulling to one side, or a pedal that feels soft.");
        }
        if (containsAny(text, "tire", "tyre", "wheel", "alignment")) {
            watchFor.add("Check your tire pressures soon, and look across the tread for wear that is heavier on one edge than the other.");
        }
        if (containsAny(text, "battery", "alternator", "electrical")) {
            watchFor.add("Notice if your car turns over slowly, the lights look dim, or a battery warning keeps coming back.");
        }
        if (watchFor.isEmpty()) {
            watchFor.add("Notice whether whatever took your car in comes back once you have driven it normally for a while.");
            watchFor.add("Keep the receipt with this record, so you have it to hand at the next visit.");
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

    /**
     * Whole words only.
     *
     * <p>It was a bare {@code contains}, so "pad" matched inside "PAD-BP" and
     * "tire" would match inside "entire". On a keyword chain that picks what
     * the owner is told their service was, a substring hit is not a near miss
     * -- it is a confident sentence about the wrong system.
     */
    private boolean containsAny(String value, String... needles) {
        if (value == null || value.isBlank()) {
            return false;
        }
        // Split on anything that is not a letter or digit and compare whole
        // tokens. Clearer than an escaped pattern, and it cannot be broken by a
        // needle that happens to contain regex syntax.
        Set<String> words = new HashSet<>(
                Arrays.asList(value.toLowerCase(Locale.ROOT).split("[^a-z0-9]+")));
        for (String needle : needles) {
            if (words.contains(needle)) {
                return true;
            }
        }
        return false;
    }

    /* "24 October 2025", not "2025-10-24". The explanation is the one place
       in the product written as sentences rather than as a record, and a date
       in digits inside a sentence reads as a database field. */
    private static final DateTimeFormatter SPOKEN_DATE =
            DateTimeFormatter.ofPattern("d MMMM uuuu", Locale.UK);

    private String formatDate(LocalDate date) {
        if (date == null) {
            return "the date saved on the record";
        }
        return date.format(SPOKEN_DATE);
    }

    private String formatMoney(BigDecimal value) {
        NumberFormat format = NumberFormat.getNumberInstance(Locale.US);
        format.setMinimumFractionDigits(2);
        format.setMaximumFractionDigits(2);
        return "PHP " + format.format(value);
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
