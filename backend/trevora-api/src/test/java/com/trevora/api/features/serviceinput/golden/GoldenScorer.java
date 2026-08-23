package com.trevora.api.features.serviceinput.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.trevora.api.features.serviceinput.ReceiptDraftFields;
import com.trevora.api.features.serviceinput.ServiceItemFields;
import com.trevora.api.features.serviceinput.ServiceLineEntryFields;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Compares one extraction against the checked answer, field by field.
 *
 * <p><b>Every rule here is chosen from an observed failure</b>, not from what
 * was convenient to compute:
 *
 * <ul>
 *   <li>Costs compare by value, not by scale. The model returns {@code 3325}
 *       and {@code 3325.00} interchangeably and neither is wrong.
 *   <li>Shop names compare by similarity. Four production runs of the same
 *       image returned {@code GTA Auio Services}; the fifth returned
 *       {@code GTA Auto Services}. An exact-match rule would score a correct
 *       reading of bad OCR as a failure, which measures the scanner and calls
 *       it the extractor.
 *   <li>Components use F1 rather than exact set equality, because returning
 *       three of four right is genuinely better than returning none, and a
 *       binary rule cannot say so.
 *   <li>Line entries are matched by description before kind is compared. Order
 *       is not meaningful on a receipt and a positional comparison would score
 *       a correct extraction as zero for reordering.
 * </ul>
 */
public final class GoldenScorer {

    /** Below this, two shop names are different shops rather than one misread. */
    static final double SHOP_NAME_THRESHOLD = 0.85;
    /** Locations vary more in wording, so the bar is lower. */
    static final double LOCATION_THRESHOLD = 0.70;
    /** Line descriptions must be this close before two lines are the same line. */
    static final double LINE_MATCH_THRESHOLD = 0.60;
    /** Pesos of slack when checking that lines sum to the total. VAT rounding. */
    static final BigDecimal RECONCILE_TOLERANCE = new BigDecimal("1.00");

    private GoldenScorer() {
    }

    public static List<FieldScore> score(GoldenCase goldenCase, ReceiptDraftFields actual) {
        return score(goldenCase, actual, actualComponents(actual));
    }

    /**
     * @param effectiveComponents the components the pipeline would actually
     *     store. Production does not keep the model's raw classification — it
     *     runs it through {@code ServiceClassificationService}, which fills an
     *     empty or invalid list from keyword rules. Scoring the raw answer
     *     measured a value no user ever sees, and reported a regression on a
     *     run the pipeline would have recovered from.
     */
    public static List<FieldScore> score(
            GoldenCase goldenCase,
            ReceiptDraftFields actual,
            java.util.Set<String> effectiveComponents
    ) {
        JsonNode expected = goldenCase.expected();
        List<String> pending = goldenCase.pendingGroundTruth();
        List<FieldScore> scores = new ArrayList<>();

        scores.add(scoreOrPending(pending, "serviceDate", () -> exact(
                "serviceDate",
                text(expected.get("serviceDate")),
                actual.serviceDate() == null ? null : actual.serviceDate().toString()
        )));

        scores.add(scoreOrPending(pending, "odometer", () -> exact(
                "odometer",
                text(expected.get("odometer")),
                actual.odometer() == null ? null : String.valueOf(actual.odometer())
        )));

        scores.add(scoreOrPending(pending, "totalCost", () -> money(
                "totalCost",
                decimal(expected.get("totalCost")),
                actual.totalCost()
        )));

        scores.add(scoreOrPending(pending, "shopName", () -> similar(
                "shopName",
                text(expected.get("shopName")),
                actual.shopName(),
                SHOP_NAME_THRESHOLD
        )));

        scores.add(scoreOrPending(pending, "location", () -> similar(
                "location",
                text(expected.get("location")),
                actual.location(),
                LOCATION_THRESHOLD
        )));

        scores.add(scoreOrPending(pending, "relatedComponents", () -> f1(
                "relatedComponents",
                stringSet(expected.get("relatedComponents")),
                effectiveComponents
        )));

        List<ServiceLineEntryFields> actualLines = flattenLines(actual);
        scores.add(scoreOrPending(pending, "lineEntries", () -> lineKinds(expected.get("lineEntries"), actualLines)));
        scores.add(scoreOrPending(pending, "lineEntries", () -> linePrices(expected.get("lineEntries"), actualLines)));
        scores.add(reconciles(actualLines, actual.totalCost()));

        return scores;
    }

    private static FieldScore scoreOrPending(List<String> pending, String key, java.util.function.Supplier<FieldScore> scorer) {
        FieldScore computed = scorer.get();
        return pending.contains(key) ? FieldScore.pending(computed.field()) : computed;
    }

    // ---- individual rules ------------------------------------------------

    static FieldScore exact(String field, String expected, String actual) {
        if (expected == null) {
            // "This receipt has no odometer" is a real answer, and inventing one
            // is a failure rather than a rounding error.
            return actual == null
                    ? FieldScore.hit(field, "correctly absent")
                    : FieldScore.miss(field, "expected nothing, got " + actual);
        }
        if (expected.equals(actual)) {
            return FieldScore.hit(field, expected);
        }
        return FieldScore.miss(field, "expected " + expected + ", got " + (actual == null ? "nothing" : actual));
    }

    /** Compares by value, so 3325 and 3325.00 agree. */
    static FieldScore money(String field, BigDecimal expected, BigDecimal actual) {
        if (expected == null) {
            return actual == null
                    ? FieldScore.hit(field, "correctly absent")
                    : FieldScore.miss(field, "expected nothing, got " + actual.toPlainString());
        }
        if (actual == null) {
            return FieldScore.miss(field, "expected " + expected.toPlainString() + ", got nothing");
        }
        if (expected.compareTo(actual) == 0) {
            return FieldScore.hit(field, expected.toPlainString());
        }
        return FieldScore.miss(field, "expected " + expected.toPlainString() + ", got " + actual.toPlainString());
    }

    static FieldScore similar(String field, String expected, String actual, double threshold) {
        if (expected == null) {
            return actual == null
                    ? FieldScore.hit(field, "correctly absent")
                    : FieldScore.miss(field, "expected nothing, got " + actual);
        }
        if (actual == null) {
            return FieldScore.miss(field, "expected " + expected + ", got nothing");
        }
        double ratio = similarity(expected, actual);
        String detail = String.format(Locale.ROOT, "%s vs %s (%.2f)", expected, actual, ratio);
        return ratio >= threshold ? FieldScore.hit(field, detail) : FieldScore.miss(field, detail);
    }

    /** Harmonic mean of precision and recall over two sets. */
    static FieldScore f1(String field, Set<String> expected, Set<String> actual) {
        if (expected.isEmpty() && actual.isEmpty()) {
            return FieldScore.hit(field, "both empty");
        }
        long overlap = actual.stream().filter(expected::contains).count();
        if (overlap == 0) {
            return FieldScore.miss(field, "expected " + expected + ", got " + actual);
        }
        double precision = (double) overlap / actual.size();
        double recall = (double) overlap / expected.size();
        double score = 2 * precision * recall / (precision + recall);
        String detail = String.format(Locale.ROOT, "expected %s, got %s (P%.2f R%.2f)", expected, actual, precision, recall);
        return score >= 0.999 ? FieldScore.hit(field, detail) : FieldScore.partial(field, score, detail);
    }

    /**
     * F1 over {@code (description, kind)} pairs, with lines matched by
     * description similarity first.
     *
     * <p>This is the number that matters most today. The extraction prompt
     * never asks for line entries, so it is currently zero on every case —
     * which is exactly the gap the set exists to make visible.
     */
    static FieldScore lineKinds(JsonNode expectedLines, List<ServiceLineEntryFields> actual) {
        if (expectedLines == null || !expectedLines.isArray() || expectedLines.isEmpty()) {
            return actual.isEmpty()
                    ? FieldScore.hit("lineKinds", "both empty")
                    : FieldScore.miss("lineKinds", "expected no lines, got " + actual.size());
        }
        if (actual.isEmpty()) {
            return FieldScore.miss("lineKinds", "expected " + expectedLines.size() + " lines, got none");
        }

        int correct = 0;
        List<ServiceLineEntryFields> remaining = new ArrayList<>(actual);
        for (JsonNode expectedLine : expectedLines) {
            ServiceLineEntryFields match = bestMatch(text(expectedLine.get("description")), remaining);
            if (match == null) {
                continue;
            }
            remaining.remove(match);
            if (equalsIgnoreCase(text(expectedLine.get("kind")), match.kind())) {
                correct++;
            }
        }

        double precision = (double) correct / actual.size();
        double recall = (double) correct / expectedLines.size();
        if (correct == 0) {
            return FieldScore.miss("lineKinds", "0 of " + expectedLines.size() + " lines matched with the right kind");
        }
        double score = 2 * precision * recall / (precision + recall);
        String detail = String.format(Locale.ROOT, "%d/%d correct kinds, %d returned (P%.2f R%.2f)",
                correct, expectedLines.size(), actual.size(), precision, recall);
        return score >= 0.999 ? FieldScore.hit("lineKinds", detail) : FieldScore.partial("lineKinds", score, detail);
    }

    /** Of the lines that matched by description, the share priced correctly. */
    static FieldScore linePrices(JsonNode expectedLines, List<ServiceLineEntryFields> actual) {
        if (expectedLines == null || !expectedLines.isArray() || expectedLines.isEmpty()) {
            return FieldScore.pending("linePrices");
        }
        if (actual.isEmpty()) {
            return FieldScore.miss("linePrices", "no lines returned");
        }

        int matched = 0;
        int correct = 0;
        List<ServiceLineEntryFields> remaining = new ArrayList<>(actual);
        for (JsonNode expectedLine : expectedLines) {
            ServiceLineEntryFields match = bestMatch(text(expectedLine.get("description")), remaining);
            if (match == null) {
                continue;
            }
            remaining.remove(match);
            matched++;
            BigDecimal want = decimal(expectedLine.get("lineTotal"));
            if (want != null && match.lineTotal() != null && want.compareTo(match.lineTotal()) == 0) {
                correct++;
            }
        }
        if (matched == 0) {
            return FieldScore.miss("linePrices", "no lines matched by description");
        }
        double score = (double) correct / matched;
        String detail = correct + "/" + matched + " matched lines priced correctly";
        return score >= 0.999 ? FieldScore.hit("linePrices", detail) : FieldScore.partial("linePrices", score, detail);
    }

    /**
     * Does the extraction agree with itself?
     *
     * <p>Unlike every other rule this needs no ground truth — a receipt carries
     * its own checksum, and lines that do not sum to the total mean something
     * was dropped or misread. Scored on every case, including ones whose
     * correct answers are still pending.
     */
    static FieldScore reconciles(List<ServiceLineEntryFields> lines, BigDecimal totalCost) {
        List<BigDecimal> priced = lines.stream()
                .map(ServiceLineEntryFields::lineTotal)
                .filter(java.util.Objects::nonNull)
                .toList();
        if (priced.isEmpty() || totalCost == null) {
            return FieldScore.pending("reconciles");
        }
        BigDecimal sum = priced.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal gap = sum.subtract(totalCost).abs();
        String detail = "lines " + sum.toPlainString() + " vs total " + totalCost.toPlainString()
                + " (gap " + gap.toPlainString() + ")";
        return gap.compareTo(RECONCILE_TOLERANCE) <= 0
                ? FieldScore.hit("reconciles", detail)
                : FieldScore.miss("reconciles", detail);
    }

    // ---- helpers ---------------------------------------------------------

    static ServiceLineEntryFields bestMatch(String description, List<ServiceLineEntryFields> candidates) {
        if (description == null) {
            return null;
        }
        ServiceLineEntryFields best = null;
        double bestRatio = LINE_MATCH_THRESHOLD;
        for (ServiceLineEntryFields candidate : candidates) {
            if (candidate.description() == null) {
                continue;
            }
            double ratio = similarity(description, candidate.description());
            if (ratio >= bestRatio) {
                bestRatio = ratio;
                best = candidate;
            }
        }
        return best;
    }

    private static List<ServiceLineEntryFields> flattenLines(ReceiptDraftFields fields) {
        List<ServiceLineEntryFields> lines = new ArrayList<>();
        if (fields.services() == null) {
            return lines;
        }
        for (ServiceItemFields item : fields.services()) {
            lines.addAll(item.lineEntriesOrEmpty());
        }
        return lines;
    }

    private static Set<String> actualComponents(ReceiptDraftFields fields) {
        Set<String> components = new LinkedHashSet<>();
        if (fields.classification() != null && fields.classification().relatedComponents() != null) {
            components.addAll(fields.classification().relatedComponents());
        }
        return components;
    }

    private static Set<String> stringSet(JsonNode node) {
        Set<String> values = new LinkedHashSet<>();
        if (node != null && node.isArray()) {
            node.forEach(entry -> values.add(entry.asText()));
        }
        return values;
    }

    private static String text(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return null;
        }
        String value = node.isTextual() ? node.asText() : node.toString();
        return value.isBlank() ? null : value.trim();
    }

    private static BigDecimal decimal(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return null;
        }
        try {
            return new BigDecimal(node.asText());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static boolean equalsIgnoreCase(String first, String second) {
        return first != null && second != null && first.equalsIgnoreCase(second.trim());
    }

    /** Case- and punctuation-insensitive, so {@code GTA Auto} matches {@code gta auto}. */
    static String normalize(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    /** 1.0 for identical strings, 0.0 for nothing in common. */
    static double similarity(String first, String second) {
        String a = normalize(first);
        String b = normalize(second);
        if (a.equals(b)) {
            return 1.0;
        }
        if (a.isEmpty() || b.isEmpty()) {
            return 0.0;
        }
        int distance = levenshtein(a, b);
        return 1.0 - ((double) distance / Math.max(a.length(), b.length()));
    }

    static int levenshtein(String a, String b) {
        int[] previous = new int[b.length() + 1];
        int[] current = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) {
            previous[j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            current[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(Math.min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
            }
            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return previous[b.length()];
    }
}
