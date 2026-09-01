package com.trevora.api.features.serviceinput;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Picks the odometer out of a document that prints several numbers shaped like
 * one.
 *
 * <p><b>Why this is code and not a prompt rule.</b> It was tried as a prompt
 * rule first. The instruction was clear, the reasoning was sound, and it changed
 * the odometer score by nothing at all while collapsing extraction on the
 * longest document in the set. Three separate additions to that prompt behaved
 * the same way. These rules are mechanical, they need no language model, and
 * here they can be tested against committed OCR text with no API calls and no
 * run-to-run noise.
 *
 * <p><b>What the documents actually look like.</b> A Toyota repair order prints
 * three numbers a reader could take for the odometer, and the layout puts each
 * label on one line with its value on the next:
 *
 * <pre>
 *   Kilometers KM | Selling Dealer          &lt;- label
 *   Credit | Assignee's Name | 242          &lt;- the reading, 242
 *   Warr Exp KM | Delivery Date
 *   Cheque | Driver's Name | 100,000        &lt;- warranty limit, not a reading
 *   REPAIR ORDER NO . | 11 | MILEAGE
 *   03/31/2025 | G7NA058266 | 3 KM          &lt;- a PREVIOUS visit's reading
 * </pre>
 *
 * <p><b>Two rules, and the second is the one that matters.</b> Reject anything
 * governed by a warranty, next-service or expiry label - those are limits and
 * targets rather than distances travelled. Then, among what is left, take the
 * largest.
 *
 * <p>The largest wins because odometers only increase. Every genuine reading on
 * a document is either this visit's or an older one, so the current reading is
 * the biggest of them - which is what separates {@code MILEAGE 3 KM} in the
 * history block from {@code Kilometers KM 242} in the vehicle block. Both are
 * honestly labelled mileage and no vocabulary can tell them apart; their order
 * can. It is not a rule reverse-engineered from one receipt: it follows from
 * what an odometer is.
 *
 * <p>This never invents a reading. With no labelled candidate it returns what
 * the model extracted, unchanged.
 */
final class OdometerResolver {

    /** Labels that introduce a distance the vehicle has actually travelled. */
    private static final List<String> READING_LABELS = List.of(
            "kilometers", "kilometres", "km reading", "mileage", "odometer", "odo", "kms");

    /**
     * Labels that introduce a number which is not a reading.
     *
     * <p>A warranty limit, a next-service target and a due figure are all
     * printed in kilometres beside the real one, and two of the three are
     * usually larger than it.
     */
    private static final List<String> LIMIT_LABELS = List.of(
            "warr exp km", "warr exp kms", "warr exp", "warranty km", "warranty",
            "next svc km", "next svc kms", "next svc", "next service km", "next service",
            "next due", "due km", "exp km", "service interval", "interval");

    /**
     * A whole number, optionally grouped with commas, standing on its own.
     *
     * <p>The guards on either side matter more than the digits. Without them
     * {@code G7NA058266} offers 058266, {@code 03/31/2025} offers 2025, and
     * both are the wrong shape of thing entirely - a document number and a date,
     * not distances. Letters, slashes, hyphens and decimal points on either side
     * all disqualify a run of digits.
     */
    private static final Pattern NUMBER =
            Pattern.compile("(?<![\\w,./-])(\\d{1,3}(?:,\\d{3})+|\\d+)(?![\\w,./-])");

    /**
     * Above this a reading is a misread rather than a high mileage. Matches the
     * ceiling extraction already applies, so the two cannot disagree.
     */
    private static final int MAX_PLAUSIBLE_KM = 2_000_000;

    private OdometerResolver() {
    }

    /**
     * @param ocrText the document as the layout reconstruction produced it
     * @param extracted what the model returned, which may be right already
     * @return the reading to keep, or {@code extracted} when the text offers no
     *     labelled candidate to prefer over it
     */
    static Integer resolve(String ocrText, Integer extracted) {
        List<Integer> candidates = readingCandidates(ocrText);
        if (candidates.isEmpty()) {
            return extracted;
        }
        int best = candidates.stream().mapToInt(Integer::intValue).max().orElseThrow();
        return best;
    }

    /** Every number on the page introduced by a reading label and not by a limit label. */
    static List<Integer> readingCandidates(String ocrText) {
        if (ocrText == null || ocrText.isBlank()) {
            return List.of();
        }
        String[] lines = ocrText.split("\\R");
        List<Integer> candidates = new ArrayList<>();

        for (int index = 0; index < lines.length; index++) {
            // The value sits on the label's line or the line below it - a form
            // prints "Kilometers KM" above the box the number goes in, and the
            // layout reconstruction preserves that.
            String governing = index > 0 ? lines[index - 1] + " " + lines[index] : lines[index];

            // Limit labels are struck out of the context before reading labels
            // are looked for, rather than used to veto the line. "Warr Exp KM"
            // and "Next Svc Km" both end in a distance word, so a plain veto
            // threw away the correct reading whenever a form printed the two
            // labels side by side - which is exactly what a Mercedes repair
            // order does with "Km Reading" and "Next Svc Km". Striking the limit
            // phrase first leaves the genuine label behind if there is one, and
            // leaves nothing behind if there is not.
            String context = strikeOut(governing.toLowerCase(Locale.ROOT));

            if (!containsAny(context, READING_LABELS)) {
                continue;
            }

            Matcher matcher = NUMBER.matcher(lines[index]);
            while (matcher.find()) {
                Integer value = parse(matcher.group(1));
                if (value != null && value >= 0 && value <= MAX_PLAUSIBLE_KM) {
                    candidates.add(value);
                }
            }
        }
        return List.copyOf(candidates);
    }

    /**
     * Removes limit labels from a line so that what remains is only the labels
     * that introduce a real reading.
     *
     * <p>Longest phrases first, so "next svc km" is taken out whole rather than
     * leaving a stray "km" behind for the reading check to trip over.
     */
    private static String strikeOut(String context) {
        String remaining = context;
        for (String label : LIMIT_LABELS) {
            remaining = remaining.replace(label, " ");
        }
        return remaining;
    }

    private static boolean containsAny(String text, List<String> needles) {
        for (String needle : needles) {
            if (text.contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private static Integer parse(String raw) {
        try {
            return Integer.valueOf(raw.replace(",", ""));
        } catch (NumberFormatException exception) {
            return null;
        }
    }
}
