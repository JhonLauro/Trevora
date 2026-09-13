package com.trevora.api.features.serviceinput;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The parts and labour figures a receipt prints about itself, read from the OCR
 * text so the review screen can check the extracted lines against them.
 *
 * <p><b>Why.</b> A receipt's lines adding up to its total proves very little. On
 * the Palmetto 57 Nissan invoice the model put the 134.27 labour charge on a part
 * line and the 77.73 fluid on the labour line: the sum still came to 239.99, and
 * the screen said everything matched. The same receipt prints PARTS AMOUNT 105.72
 * and LABOR AMOUNT 134.27, which catches that swap at once.
 *
 * <p><b>Read, never computed.</b> Every figure here is a value printed next to
 * its label. The amounts and line kinds are left exactly as the model returned
 * them, and the owner decides what is right. Where both a per-job figure and the
 * totals box are printed and they disagree, the totals box wins and the
 * disagreement is reported rather than hidden. The one consumer that sets a value
 * from these figures is {@link ReceiptTotalResolver}, and only when four of them
 * reconcile.
 *
 * <p><b>What this check cannot see.</b> Both are consequences of comparing sums,
 * and neither is fixable by reading harder:
 * <ul>
 *   <li>A part tagged as supplies, or supplies tagged as a part. Both kinds count
 *       toward the printed PARTS figure, because receipts print consumables under
 *       parts. The sum is unchanged, so the check passes.</li>
 *   <li>Two part amounts swapped with each other (or two labour amounts). The
 *       parts total is unchanged, so the check passes. Only the paper tells
 *       which part cost what.</li>
 * </ul>
 * Fee lines count toward neither figure.
 *
 * <p><b>States.</b> {@link Split#READ} means a parts and a labour figure were
 * both read. {@link Split#UNREADABLE} means the labels are printed but their
 * values could not be read, which the screen says out loud rather than passing
 * silently. {@link Split#NOT_PRINTED} means the receipt has no such split, which
 * is most receipts, and gets no warning.
 */
public record PrintedSubtotals(
        Split split,
        BigDecimal parts,
        BigDecimal labour,
        Source source,
        boolean sourcesDisagree,
        BigDecimal charges,
        BigDecimal tax,
        BigDecimal credits,
        boolean adjustmentsReadable,
        Totals totals
) {

    public enum Split { READ, UNREADABLE, NOT_PRINTED }

    public enum Source { TOTALS_BOX, PER_JOB }

    /** One labelled figure as printed, cited from its label onward: "LESS INSURANCE | 56.79". */
    public record Cited(String text, BigDecimal amount) { }

    /**
     * The totals box as rows, kept word for word so a value set from them can
     * cite what it came from.
     *
     * @param chargesLabels how many TOTAL CHARGES labels the whole text carries.
     *     More than one means several documents in one upload, and no one box
     *     speaks for all of them.
     * @param adjustmentsComplete every tax and credit label under the charges had
     *     its amount. True when there were none, unlike {@code adjustmentsReadable},
     *     which needs at least one row to say anything.
     * @param paid the amount-paid row (THIS AMOUNT, PLEASE PAY, AMOUNT DUE) just
     *     below the adjustments, or null
     */
    public record Totals(
            int chargesLabels,
            String chargesRow,
            List<Cited> taxRows,
            List<Cited> creditRows,
            boolean adjustmentsComplete,
            BigDecimal paid,
            String paidRow
    ) {
        static final Totals NONE = new Totals(0, null, List.of(), List.of(), false, null, null);
    }

    static final PrintedSubtotals NONE =
            new PrintedSubtotals(Split.NOT_PRINTED, null, null, null, false, null, null, null, false, Totals.NONE);

    /** A money amount at the start of a cell: "105.72", "1,250.00", "0.00 OTHER :". */
    private static final Pattern LEADING_AMOUNT =
            Pattern.compile("\\s*((?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2})(?![\\d.,])");

    // Totals box: "LABOR AMOUNT | 134.27", "PARTS AMOUNT | 105.72".
    private static final Pattern BOX_PARTS = Pattern.compile("\\bPARTS\\s+AMOUNT\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern BOX_LABOUR = Pattern.compile("\\bLABOU?R\\s+AMOUNT\\b", Pattern.CASE_INSENSITIVE);

    // Per job: "PARTS : | 0.00", "LABOR : | 134.27", closed by "TOTAL LINE A".
    // The colon matters: prose such as "PARTS FOUND DEFECTIVE" never carries one.
    private static final Pattern JOB_PARTS = Pattern.compile("\\bPARTS\\s*:", Pattern.CASE_INSENSITIVE);
    private static final Pattern JOB_LABOUR = Pattern.compile("\\bLABOU?R\\s*:", Pattern.CASE_INSENSITIVE);
    private static final Pattern JOB_TOTAL = Pattern.compile("\\bTOTAL\\s+LINE\\s+[A-Z]\\b", Pattern.CASE_INSENSITIVE);

    private static final Pattern CHARGES = Pattern.compile("\\bTOTAL\\s+CHARGES\\b", Pattern.CASE_INSENSITIVE);
    // Credits and tax are read only in the few rows under TOTAL CHARGES. Talisay
    // receipts print "Less : Withholding Tax", "LESS DISCOUNT" and "INPUT TAX"
    // elsewhere on the page; none of them is an adjustment to printed charges.
    private static final Pattern CREDIT = Pattern.compile("\\bLESS\\b[^|]*", Pattern.CASE_INSENSITIVE);
    private static final Pattern TAX = Pattern.compile("\\bTAX\\b\\s*:?", Pattern.CASE_INSENSITIVE);
    private static final Pattern END_OF_BOX =
            Pattern.compile("\\bPLEASE\\s+PAY\\b|\\bTHIS\\s+AMOUNT\\b|\\bAMOUNT\\s+DUE\\b", Pattern.CASE_INSENSITIVE);
    private static final int ADJUSTMENT_ROWS = 4;
    // Palmetto prints "PLEASE PAY" on one row and "THIS AMOUNT | 200.00" on the next.
    private static final int PAID_ROWS = 3;

    public static PrintedSubtotals read(String ocrText) {
        if (ocrText == null || ocrText.isBlank()) {
            return NONE;
        }
        List<String> lines = ocrText.lines().toList();

        Labelled boxParts = labelled(BOX_PARTS, lines);
        Labelled boxLabour = labelled(BOX_LABOUR, lines);
        Labelled jobParts = labelled(JOB_PARTS, lines);
        Labelled jobLabour = labelled(JOB_LABOUR, lines);
        int jobTotals = labelled(JOB_TOTAL, lines).labels();

        boolean boxPrinted = boxParts.labels() > 0 && boxLabour.labels() > 0;
        boolean boxRead = boxPrinted && boxParts.first() != null && boxLabour.first() != null;
        boolean jobsPrinted = jobTotals > 0 && jobParts.labels() > 0 && jobLabour.labels() > 0;
        // Per-job figures count only when every job's figure was read. A sum with
        // one job missing would be a computed number presented as a printed one.
        boolean jobsRead = jobsPrinted && jobParts.complete() && jobLabour.complete();

        Split split;
        BigDecimal parts = null;
        BigDecimal labour = null;
        Source source = null;
        boolean disagree = false;
        if (boxRead) {
            split = Split.READ;
            parts = boxParts.first();
            labour = boxLabour.first();
            source = Source.TOTALS_BOX;
            disagree = jobsRead
                    && (jobParts.sum().compareTo(parts) != 0 || jobLabour.sum().compareTo(labour) != 0);
        } else if (jobsRead) {
            split = Split.READ;
            parts = jobParts.sum();
            labour = jobLabour.sum();
            source = Source.PER_JOB;
        } else if (boxPrinted || jobsPrinted) {
            split = Split.UNREADABLE;
        } else {
            split = Split.NOT_PRINTED;
        }

        BigDecimal charges = null;
        BigDecimal tax = null;
        BigDecimal credits = null;
        boolean adjustmentsReadable = false;
        String chargesRow = null;
        List<Cited> taxRows = List.of();
        List<Cited> creditRows = List.of();
        boolean adjustmentsComplete = false;
        BigDecimal paid = null;
        String paidRow = null;
        int chargesLabels = cited(CHARGES, lines, null).size();

        int chargesLine = firstLineMatching(CHARGES, lines);
        if (chargesLine >= 0) {
            List<Cited> chargesCells = cited(CHARGES, List.of(lines.get(chargesLine)), null);
            charges = chargesCells.get(0).amount();
            chargesRow = chargesCells.get(0).text();
        }
        if (charges != null) {
            List<String> rows = new ArrayList<>();
            int endOfBox = -1;
            int i = chargesLine + 1;
            for (; i < lines.size() && rows.size() < ADJUSTMENT_ROWS; i++) {
                if (END_OF_BOX.matcher(lines.get(i)).find()) {
                    endOfBox = i;
                    break;
                }
                rows.add(lines.get(i));
            }
            creditRows = cited(CREDIT, rows, null);
            taxRows = cited(TAX, rows, CREDIT);
            Labelled creditLabels = Labelled.of(creditRows);
            Labelled taxLabels = Labelled.of(taxRows);
            credits = creditLabels.values().isEmpty() ? null : creditLabels.sum();
            tax = taxLabels.values().isEmpty() ? null : taxLabels.sum();
            int labels = creditLabels.labels() + taxLabels.labels();
            adjustmentsReadable = labels > 0 && creditLabels.complete() && taxLabels.complete();
            adjustmentsComplete = (creditLabels.labels() == 0 || creditLabels.complete())
                    && (taxLabels.labels() == 0 || taxLabels.complete());

            int paidFrom = endOfBox >= 0 ? endOfBox : i;
            for (int j = paidFrom; j < lines.size() && j < paidFrom + PAID_ROWS && paid == null; j++) {
                for (Cited cell : cited(END_OF_BOX, List.of(lines.get(j)), null)) {
                    if (cell.amount() != null) {
                        paid = cell.amount();
                        paidRow = cell.text();
                        break;
                    }
                }
            }
        }

        Totals totals = new Totals(chargesLabels, chargesRow, taxRows, creditRows, adjustmentsComplete, paid, paidRow);
        return new PrintedSubtotals(
                split, parts, labour, source, disagree, charges, tax, credits, adjustmentsReadable, totals);
    }

    /** For {@code field_metadata.printedSubtotals}. Amounts as strings, so no float ever touches money. */
    public Map<String, Object> toMetadata() {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("split", split.name());
        putAmount(metadata, "parts", parts);
        putAmount(metadata, "labour", labour);
        if (source != null) {
            metadata.put("source", source.name());
        }
        metadata.put("sourcesDisagree", sourcesDisagree);
        putAmount(metadata, "charges", charges);
        putAmount(metadata, "tax", tax);
        putAmount(metadata, "credits", credits);
        metadata.put("adjustmentsReadable", adjustmentsReadable);
        putAmount(metadata, "paid", totals == null ? null : totals.paid());
        return metadata;
    }

    private static void putAmount(Map<String, Object> metadata, String key, BigDecimal value) {
        if (value != null) {
            metadata.put(key, value.toPlainString());
        }
    }

    private record Labelled(int labels, List<BigDecimal> values, BigDecimal first) {
        static Labelled of(List<Cited> cells) {
            List<BigDecimal> values = cells.stream().map(Cited::amount).filter(java.util.Objects::nonNull).toList();
            return new Labelled(cells.size(), values, cells.isEmpty() ? null : cells.get(0).amount());
        }

        boolean complete() {
            return labels > 0 && values.size() == labels;
        }

        BigDecimal sum() {
            return values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        }
    }

    private static Labelled labelled(Pattern label, List<String> lines) {
        return Labelled.of(cited(label, lines, null));
    }

    /**
     * Every cell carrying {@code label}, with the amount printed right after it:
     * in the rest of that cell, or at the start of the next one when the label
     * ends its cell. Cells whose text matches {@code excluded} are skipped, so a
     * "LESS ... TAX" credit row is not counted as tax too.
     *
     * <p>The citation starts at the label, not the cell. On Palmetto the credit
     * cell is "add battery so Desenho to perform the servicesars LESS INSURANCE";
     * the legal text glued in front is OCR layout, not the receipt's label.
     */
    private static List<Cited> cited(Pattern label, List<String> lines, Pattern excluded) {
        List<Cited> found = new ArrayList<>();
        for (String line : lines) {
            String[] cells = line.split("\\|", -1);
            for (int i = 0; i < cells.length; i++) {
                if (excluded != null && excluded.matcher(cells[i]).find()) {
                    continue;
                }
                Matcher matcher = label.matcher(cells[i]);
                if (!matcher.find()) {
                    continue;
                }
                String rest = cells[i].substring(matcher.end());
                if (rest.isBlank() && i + 1 < cells.length) {
                    rest = cells[i + 1];
                }
                Matcher amount = LEADING_AMOUNT.matcher(rest);
                BigDecimal value = amount.lookingAt() ? new BigDecimal(amount.group(1).replace(",", "")) : null;
                String name = matcher.group().trim().replaceAll("\\s+", " ");
                found.add(new Cited(value == null ? name : name + " | " + amount.group(1), value));
            }
        }
        return found;
    }

    private static int firstLineMatching(Pattern pattern, List<String> lines) {
        for (int i = 0; i < lines.size(); i++) {
            if (pattern.matcher(lines.get(i)).find()) {
                return i;
            }
        }
        return -1;
    }
}
