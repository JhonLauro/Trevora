package com.trevora.api.features.serviceinput;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Sets {@code total_cost} to the bill before coverage, and {@code amount_covered}
 * to the credit, when the receipt's own totals box proves both.
 *
 * <p><b>What the columns mean.</b> Migration 010: {@code total_cost} is what the
 * service cost, {@code amount_covered} is what insurance, a warranty or goodwill
 * absorbed, and what the owner paid is the difference, never stored. The Palmetto
 * 57 Nissan invoice prints TOTAL CHARGES 239.99, LESS INSURANCE 56.79, TAX 16.80
 * and THIS AMOUNT 200.00. The model reads 200.00 as the total on some runs, and a
 * record holding 200.00 with 56.79 covered reports 143.21 paid while every check
 * passes. Here it becomes 256.79 with 56.79 covered: 200.00 paid, as printed.
 *
 * <p><b>Only when it adds up.</b> Charges plus tax less credits has to equal the
 * printed amount paid, to the centavo. That is four printed figures agreeing,
 * which is the evidence the credit row was read as a deduction and the tax row
 * as an addition. Anything short of it leaves the model's total alone and marks
 * nothing covered: a half-filled coverage field is worse than an empty one.
 *
 * <p><b>Only insurance, warranty or goodwill.</b> A credit is recorded as covered
 * only when every non-zero credit row says one of those. "LESS DISCOUNT" is a
 * lower bill, not coverage, and there is no column yet to say which kind a
 * credit was, so any other deduction leaves the total and the coverage exactly
 * as the model read them.
 *
 * <p><b>Only one document.</b> A text with more than one TOTAL CHARGES is several
 * documents in one upload; the totals box of one of them does not speak for the
 * total chosen across all of them.
 */
final class ReceiptTotalResolver {

    private static final BigDecimal TOLERANCE = new BigDecimal("0.01");
    private static final Pattern COVERAGE_LABEL =
            Pattern.compile("\\b(INSURANCE|INSURER|WARRANTY|GOODWILL)\\b", Pattern.CASE_INSENSITIVE);

    /**
     * @param amountCovered null when nothing was credited, which is not the same
     *     as a proven zero and leaves the draft's default untouched
     * @param coveredCitation the credit rows as printed, or null
     * @param note a sentence for the draft's warnings, or null when nothing the
     *     owner would notice changed
     */
    record Resolution(
            BigDecimal totalCost,
            BigDecimal amountCovered,
            String totalCitation,
            String coveredCitation,
            String note
    ) { }

    private ReceiptTotalResolver() {
    }

    static Optional<Resolution> resolve(PrintedSubtotals printed, BigDecimal extractedTotal) {
        if (printed == null || printed.totals() == null) {
            return Optional.empty();
        }
        PrintedSubtotals.Totals box = printed.totals();
        BigDecimal charges = printed.charges();
        BigDecimal paid = box.paid();
        if (box.chargesLabels() != 1 || charges == null || paid == null || !box.adjustmentsComplete()) {
            return Optional.empty();
        }

        BigDecimal tax = printed.tax() == null ? BigDecimal.ZERO : printed.tax();
        BigDecimal credits = printed.credits() == null ? BigDecimal.ZERO : printed.credits();
        if (charges.add(tax).subtract(credits).subtract(paid).abs().compareTo(TOLERANCE) > 0) {
            return Optional.empty();
        }

        List<PrintedSubtotals.Cited> credited = box.creditRows().stream()
                .filter(row -> row.amount() != null && row.amount().signum() > 0)
                .toList();
        boolean covered = credits.signum() > 0;
        if (covered && !credited.stream().allMatch(row -> COVERAGE_LABEL.matcher(row.text()).find())) {
            return Optional.empty();
        }

        BigDecimal total = charges.add(tax);
        String totalCitation = Stream.concat(
                        Stream.of(box.chargesRow()),
                        box.taxRows().stream().filter(row -> row.amount() != null).map(PrintedSubtotals.Cited::text))
                .collect(Collectors.joining(" + "));
        String coveredCitation = covered
                ? credited.stream().map(PrintedSubtotals.Cited::text).collect(Collectors.joining(" + "))
                : null;

        return Optional.of(new Resolution(
                total,
                covered ? credits : null,
                totalCitation,
                coveredCitation,
                note(extractedTotal, total, charges, tax, covered ? credits : null, paid)));
    }

    private static String note(
            BigDecimal extractedTotal,
            BigDecimal total,
            BigDecimal charges,
            BigDecimal tax,
            BigDecimal covered,
            BigDecimal paid
    ) {
        boolean changed = extractedTotal == null || extractedTotal.compareTo(total) != 0;
        if (covered == null && !changed) {
            return null;
        }
        String printed = tax.signum() > 0
                ? "the charges and tax printed on the receipt (" + charges.toPlainString()
                        + " + " + tax.toPlainString() + ")"
                : "the charges printed on the receipt";
        String sentence = "Total cost set to " + total.toPlainString() + ", " + printed;
        if (covered != null) {
            return sentence + ". The receipt's " + covered.toPlainString()
                    + " credit is recorded as covered, so the amount paid is " + paid.toPlainString() + ".";
        }
        return sentence + (extractedTotal == null
                ? "."
                : ", not the " + extractedTotal.toPlainString() + " first extracted.");
    }
}
