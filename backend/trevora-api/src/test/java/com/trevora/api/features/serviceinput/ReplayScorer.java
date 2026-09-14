package com.trevora.api.features.serviceinput;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * Scores a receipt extraction against a hand-confirmed answer key, row by row.
 *
 * <p><b>Why per row.</b> The review screen's checks compare sums, so a run can
 * be right on money and wrong on everything else. On the Palmetto 57 Nissan
 * receipt one run had all three amounts correct while "TRANSMISSION FLUID" had
 * been invented, "ENHANCER" lost its "CVT", and SYN / CVT 5QT was missing. Here
 * each expected line is found by its key word and then scored on description,
 * kind, amount and part code separately; any extracted line that matches no key
 * is an invented line, and a run is exact only when every field of every line
 * is right and nothing was invented.
 *
 * <p><b>Layout is scored separately from the model.</b> {@link #layoutPairs}
 * reads only the OCR text: for each priced line, does one text row carry both
 * the line's identifying text and its price? That needs no API call and says
 * whether our row rebuilding put the price where the paper has it, before the
 * model is involved at all.
 */
final class ReplayScorer {

    record ExpectedLine(
            String key,
            List<String> descriptions,
            String kind,
            BigDecimal amount,
            String partCode,
            String layoutToken
    ) {
    }

    record AnswerKey(
            String receipt,
            String confirmedBy,
            String notes,
            BigDecimal totalCost,
            BigDecimal amountCovered,
            List<String> remarksContains,
            List<ExpectedLine> lines
    ) {
    }

    /** One expected line's outcome. {@code partCodeOk} is null when the key does not score the code. */
    record LineScore(
            String key,
            boolean found,
            boolean descriptionOk,
            boolean kindOk,
            boolean amountOk,
            Boolean partCodeOk,
            String extractedDescription,
            BigDecimal extractedAmount,
            String extractedPartCode
    ) {
        boolean allOk() {
            return found && descriptionOk && kindOk && amountOk && (partCodeOk == null || partCodeOk);
        }
    }

    record RunScore(
            List<LineScore> lines,
            List<String> invented,
            boolean totalOk,
            boolean coveredOk,
            boolean remarksOk
    ) {
        boolean exact() {
            return invented.isEmpty() && totalOk && coveredOk && remarksOk
                    && lines.stream().allMatch(LineScore::allOk);
        }
    }

    /** One priced line's layout outcome: does a single OCR row hold its text and its price? */
    record LayoutPair(String key, String token, BigDecimal amount, boolean sameRow) {
    }

    private ReplayScorer() {
    }

    static AnswerKey load(String classpathResource) {
        try (InputStream in = ReplayScorer.class.getClassLoader().getResourceAsStream(classpathResource)) {
            if (in == null) {
                throw new IllegalStateException("Answer key not on the classpath: " + classpathResource);
            }
            return new ObjectMapper().readValue(in, AnswerKey.class);
        } catch (IOException exception) {
            throw new IllegalStateException("Could not read answer key " + classpathResource, exception);
        }
    }

    static RunScore score(AnswerKey key, List<ServiceLineEntryFields> extracted, BigDecimal totalCost,
            BigDecimal amountCovered, String remarks) {
        List<ServiceLineEntryFields> remaining = new ArrayList<>(extracted == null ? List.of() : extracted);
        List<LineScore> lines = new ArrayList<>();
        for (ExpectedLine expected : key.lines()) {
            ServiceLineEntryFields match = null;
            for (ServiceLineEntryFields candidate : remaining) {
                if (normalise(candidate.description()).contains(normalise(expected.key()))) {
                    match = candidate;
                    break;
                }
            }
            if (match == null) {
                lines.add(new LineScore(expected.key(), false, false, false, false,
                        expected.partCode() == null ? null : false, null, null, null));
                continue;
            }
            remaining.remove(match);
            String description = normalise(match.description());
            boolean descriptionOk = expected.descriptions().stream().map(ReplayScorer::normalise)
                    .anyMatch(description::equals);
            boolean kindOk = expected.kind().equalsIgnoreCase(String.valueOf(match.kind()));
            boolean amountOk = sameMoney(expected.amount(), match.lineTotal());
            // The paper prints the code in its own column on the item's row, so a read that
            // keeps the row whole ("66001 CVT ENHANCER") has the code, just not in the code field.
            Boolean partCodeOk = expected.partCode() == null
                    ? null
                    : compact(expected.partCode()).equals(compact(match.partCode()))
                            || codeLeadsDescription(expected.partCode(), match.description());
            lines.add(new LineScore(expected.key(), true, descriptionOk, kindOk, amountOk, partCodeOk,
                    match.description(), match.lineTotal(), match.partCode()));
        }
        List<String> invented = remaining.stream()
                .map(line -> line.description() + " (" + line.kind() + ", " + line.lineTotal() + ")")
                .toList();
        String remarkText = normalise(remarks);
        boolean remarksOk = key.remarksContains() == null
                || key.remarksContains().stream().map(ReplayScorer::normalise).allMatch(remarkText::contains);
        return new RunScore(lines, invented, sameMoney(key.totalCost(), totalCost),
                key.amountCovered() == null || sameMoney(key.amountCovered(), amountCovered), remarksOk);
    }

    static List<LayoutPair> layoutPairs(AnswerKey key, String ocrText) {
        List<String> rows = ocrText == null ? List.of() : ocrText.lines().toList();
        List<LayoutPair> pairs = new ArrayList<>();
        for (ExpectedLine expected : key.lines()) {
            if (expected.layoutToken() == null || expected.amount() == null || expected.amount().signum() == 0) {
                continue;
            }
            String amount = expected.amount().toPlainString();
            boolean sameRow = rows.stream()
                    .filter(row -> row.toUpperCase(Locale.ROOT).contains(expected.layoutToken().toUpperCase(Locale.ROOT)))
                    .anyMatch(row -> row.contains(amount));
            pairs.add(new LayoutPair(expected.key(), expected.layoutToken(), expected.amount(), sameRow));
        }
        return pairs;
    }

    /** A readable report for one run. */
    static String render(RunScore score) {
        StringBuilder out = new StringBuilder();
        // The extracted values sit beside each mark, so a failure can be read as the model's
        // mistake or the key's strictness without re-running anything.
        out.append(String.format(Locale.ROOT, "  %-15s %-6s %-12s %-5s %-17s %-22s %s%n",
                "line", "found", "description", "kind", "amount", "code", "extracted as"));
        for (LineScore line : score.lines()) {
            out.append(String.format(Locale.ROOT, "  %-15s %-6s %-12s %-5s %-17s %-22s %s%n",
                    line.key(), mark(line.found()), mark(line.descriptionOk()), mark(line.kindOk()),
                    mark(line.amountOk()) + " " + (line.extractedAmount() == null ? "-" : line.extractedAmount().toPlainString()),
                    (line.partCodeOk() == null ? "-" : mark(line.partCodeOk())) + " "
                            + (line.extractedPartCode() == null ? "-" : line.extractedPartCode()),
                    line.extractedDescription() == null ? "(missing)" : line.extractedDescription()));
        }
        out.append("  invented lines: ").append(score.invented().isEmpty() ? "none" : score.invented()).append('\n');
        out.append("  total ").append(mark(score.totalOk()))
                .append("  covered ").append(mark(score.coveredOk()))
                .append("  remarks ").append(mark(score.remarksOk()))
                .append("  EXACT: ").append(score.exact() ? "yes" : "no").append('\n');
        return out.toString();
    }

    /** Field-by-field accuracy across runs, so "3 of 5 exact" can be read as which field failed. */
    static String summarise(List<RunScore> runs) {
        Map<String, int[]> fields = new LinkedHashMap<>();
        for (RunScore run : runs) {
            for (LineScore line : run.lines()) {
                tally(fields, line.key() + " found", line.found());
                tally(fields, line.key() + " description", line.descriptionOk());
                tally(fields, line.key() + " kind", line.kindOk());
                tally(fields, line.key() + " amount", line.amountOk());
                if (line.partCodeOk() != null) {
                    tally(fields, line.key() + " part code", line.partCodeOk());
                }
            }
            tally(fields, "no invented lines", run.invented().isEmpty());
            tally(fields, "total cost", run.totalOk());
            tally(fields, "amount covered", run.coveredOk());
            tally(fields, "remarks", run.remarksOk());
        }
        StringBuilder out = new StringBuilder();
        long exact = runs.stream().filter(RunScore::exact).count();
        out.append("EXACT RUNS: ").append(exact).append(" of ").append(runs.size()).append('\n');
        fields.forEach((name, counts) -> out.append(String.format(Locale.ROOT, "  %-32s %d/%d%n",
                name, counts[0], counts[1])));
        return out.toString();
    }

    private static void tally(Map<String, int[]> fields, String name, boolean ok) {
        int[] counts = fields.computeIfAbsent(name, ignored -> new int[2]);
        if (ok) {
            counts[0]++;
        }
        counts[1]++;
    }

    private static String mark(boolean ok) {
        return ok ? "ok" : "XX";
    }

    static String normalise(String text) {
        if (text == null) {
            return "";
        }
        return text.toUpperCase(Locale.ROOT).replaceAll("\\s*/\\s*", " / ").replaceAll("\\s+", " ").trim();
    }

    /**
     * Whether the description starts with the code, with or without the printed
     * quantity in front ("66001 CVT ENHANCER", "1 66001 CVT ENHANCER"). Both forms are
     * tried rather than the quantity stripped first, because a numeric code such as
     * 66001 looks exactly like a quantity.
     */
    private static boolean codeLeadsDescription(String code, String description) {
        String words = normalise(description);
        String prefix = code.toUpperCase(Locale.ROOT) + " ";
        return words.startsWith(prefix) || words.replaceFirst("^\\d+\\s+", "").startsWith(prefix);
    }

    private static String compact(String text) {
        return text == null ? "" : text.toUpperCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    private static boolean sameMoney(BigDecimal expected, BigDecimal actual) {
        if (expected == null || actual == null) {
            return Objects.equals(expected, actual);
        }
        return expected.compareTo(actual) == 0;
    }
}
