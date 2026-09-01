package com.trevora.api.features.serviceinput.golden;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * What Google Vision did with the photograph, before any model saw the text.
 *
 * <p>The field scores in {@link GoldenReport} say whether the answer was right.
 * They cannot say <i>where</i> it went wrong, and on the image layer that is
 * the whole question: an extraction that misses half the prices because the OCR
 * text never contained them is not a prompt problem, and no amount of prompt
 * work will fix it.
 *
 * <p>Three numbers here, each earning its place from a real failure:
 *
 * <ul>
 *   <li><b>Stability.</b> Two production extractions of the same Toyota invoice
 *       returned totals ₱400 apart. The model was not at fault — Vision
 *       returned 3,502 characters on one run and 3,511 on the other <i>for the
 *       same image</i>. Different text, different answer. So the same image is
 *       sent several times and the report says whether the text came back
 *       identical.
 *   <li><b>Column breaks.</b> The layout reconstruction emits {@code |} where a
 *       gap is wide enough to be a column boundary. Zero of them on a tabular
 *       receipt means the reconstruction found no table — the failure while it
 *       is still a shape problem, before it becomes a wrong number.
 *   <li><b>Orphan amounts.</b> A line holding a price and nothing else is a
 *       price that came unstuck from its description. This is exactly what a
 *       skewed photograph does: a row spanning the page drifts vertically
 *       further than the row tolerance allows, the row splits, and the far
 *       column — the money — lands on a line of its own. On the Toyota invoice
 *       this produced seventeen amounts with nothing saying what they were for.
 *       Counting them turns "the tilted ones come out wrong" into a number that
 *       moves when a fix works.
 * </ul>
 */
public final class OcrStabilityReport {

    private final Map<String, List<String>> textsByCase = new LinkedHashMap<>();
    private final List<String> skipped = new ArrayList<>();

    public void record(String caseId, String ocrText) {
        textsByCase.computeIfAbsent(caseId, key -> new ArrayList<>()).add(ocrText == null ? "" : ocrText);
    }

    public void recordSkip(String caseId, String reason) {
        skipped.add(caseId + ": " + reason);
    }

    public boolean isEmpty() {
        return textsByCase.isEmpty();
    }

    public List<String> skipped() {
        return List.copyOf(skipped);
    }

    public String render() {
        StringBuilder out = new StringBuilder();
        out.append("\nOCR LAYER - what Vision returned, before extraction\n");
        out.append("=".repeat(78)).append("\n");

        for (var entry : textsByCase.entrySet()) {
            List<String> texts = entry.getValue();
            Set<String> distinct = new LinkedHashSet<>(texts);

            List<Integer> chars = texts.stream().map(String::length).sorted().toList();
            List<Integer> lines = texts.stream().map(OcrStabilityReport::lineCount).sorted().toList();
            List<Integer> breaks = texts.stream().map(OcrStabilityReport::columnBreaks).sorted().toList();
            List<Integer> orphans = texts.stream().map(OcrStabilityReport::orphanAmountLines).sorted().toList();

            out.append("\n").append(entry.getKey()).append("\n");
            out.append("-".repeat(78)).append("\n");
            out.append(String.format(Locale.ROOT, "  %-20s %s%n", "chars", range(chars)));
            out.append(String.format(Locale.ROOT, "  %-20s %s%n", "lines", range(lines)));
            out.append(String.format(Locale.ROOT, "  %-20s %s%s%n", "column breaks", range(breaks),
                    breaks.get(breaks.size() - 1) == 0 ? "   <- no table found" : ""));
            out.append(String.format(Locale.ROOT, "  %-20s %s%s%n", "orphan amounts", range(orphans),
                    orphans.get(orphans.size() - 1) > 0 ? "   <- prices with no description" : ""));
            out.append(String.format(Locale.ROOT, "  %-20s %s%n", "across runs",
                    distinct.size() == 1
                            ? "identical text every run"
                            : distinct.size() + " different texts from " + texts.size()
                                    + " runs  UNSTABLE - same image, different text"));

            if (distinct.size() > 1) {
                out.append("  first divergence: ").append(firstDivergence(texts)).append("\n");
            }
        }

        if (!skipped.isEmpty()) {
            out.append("\nSKIPPED - no photograph available\n");
            out.append("-".repeat(78)).append("\n");
            skipped.forEach(note -> out.append("  ").append(note).append("\n"));
            out.append("\n  Point GOLDEN_IMAGE_DIR at the folder holding these files.\n");
        }

        out.append("\n");
        return out.toString();
    }

    /** {@code 3502} when every run agreed, {@code 3502..3511 (+9)} when they did not. */
    private static String range(List<Integer> sorted) {
        int min = sorted.get(0);
        int max = sorted.get(sorted.size() - 1);
        return min == max
                ? String.valueOf(min)
                : String.format(Locale.ROOT, "%d..%d (+%d)", min, max, max - min);
    }

    /**
     * The first line where two runs disagree, with both readings.
     *
     * <p>A character count says the runs differed. This says what differed,
     * which is usually one misread glyph in one amount and is worth seeing
     * rather than guessing at.
     */
    private static String firstDivergence(List<String> texts) {
        String first = texts.get(0);
        for (String other : texts) {
            if (other.equals(first)) {
                continue;
            }
            String[] a = splitLines(first);
            String[] b = splitLines(other);
            for (int i = 0; i < Math.max(a.length, b.length); i++) {
                String left = i < a.length ? a[i] : "(no line)";
                String right = i < b.length ? b[i] : "(no line)";
                if (!left.equals(right)) {
                    return "line " + (i + 1) + "\n      run A: " + left + "\n      run B: " + right;
                }
            }
        }
        return "(none found)";
    }

    private static String[] splitLines(String text) {
        return text.split("\\R");
    }

    private static int lineCount(String text) {
        return text.isBlank() ? 0 : splitLines(text).length;
    }

    /** Column boundaries the layout reconstruction found. */
    private static int columnBreaks(String text) {
        int count = 0;
        for (int i = 0; i < text.length(); i++) {
            if (text.charAt(i) == '|') {
                count++;
            }
        }
        return count;
    }

    /**
     * Lines that are an amount and nothing else.
     *
     * <p>Deliberately strict: a line counts only when it holds at least one
     * digit and no letters at all, so a genuine {@code TOTAL P 3,325.00} is not
     * counted and a bare {@code 3,325.00} is. Currency signs, commas and the
     * column pipe are stripped first, because a stranded price on a receipt
     * printed in pesos usually still carries its {@code P}.
     */
    static int orphanAmountLines(String text) {
        int count = 0;
        for (String line : splitLines(text)) {
            String stripped = line.replaceAll("[\\s|,.:P₱$()-]", "");
            if (stripped.isEmpty()) {
                continue;
            }
            if (stripped.chars().allMatch(Character::isDigit)) {
                count++;
            }
        }
        return count;
    }
}
