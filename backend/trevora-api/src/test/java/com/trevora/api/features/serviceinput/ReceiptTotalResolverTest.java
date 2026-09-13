package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ReceiptTotalResolverTest {

    private static final String BOX = """
            TOTAL CHARGES | 239.99
            LESS INSURANCE | 56.79
            TAX | 16.80
            PLEASE PAY
            THIS AMOUNT | 200.00
            """;

    private static ReceiptTotalResolver.Resolution resolved(String text, String extracted) {
        return ReceiptTotalResolver.resolve(PrintedSubtotals.read(text), extracted == null ? null : new BigDecimal(extracted))
                .orElseThrow();
    }

    @Test
    void palmettoRecordsTheBillBeforeCoverageAndTheInsuranceCredit() throws IOException {
        String text = Files.readString(
                Path.of("src/test/resources/printed-subtotals/palmetto-jobs-and-totals.txt"), StandardCharsets.UTF_8);

        ReceiptTotalResolver.Resolution resolution = resolved(text, "200.00");

        assertThat(resolution.totalCost()).isEqualByComparingTo("256.79");
        assertThat(resolution.amountCovered()).isEqualByComparingTo("56.79");
        assertThat(resolution.totalCitation()).isEqualTo("TOTAL CHARGES | 239.99 + TAX | 16.80");
        // From the label onward: the legal text OCR glued in front is not cited.
        assertThat(resolution.coveredCitation()).isEqualTo("LESS INSURANCE | 56.79");
        assertThat(resolution.note()).contains("256.79").contains("56.79").contains("200.00");
    }

    @Test
    void aCreditThatDoesNotReconcileChangesNothing() {
        String misread = BOX.replace("THIS AMOUNT | 200.00", "THIS AMOUNT | 210.00");

        assertThat(ReceiptTotalResolver.resolve(PrintedSubtotals.read(misread), new BigDecimal("210.00"))).isEmpty();
    }

    @Test
    void aDiscountIsNotCoverageSoItChangesNothing() {
        String discounted = BOX.replace("LESS INSURANCE", "LESS DISCOUNT");

        assertThat(ReceiptTotalResolver.resolve(PrintedSubtotals.read(discounted), new BigDecimal("200.00"))).isEmpty();
    }

    @Test
    void anUnreadableCreditAmountChangesNothing() {
        String unreadable = BOX.replace("LESS INSURANCE | 56.79", "LESS INSURANCE | 56,7g");

        assertThat(ReceiptTotalResolver.resolve(PrintedSubtotals.read(unreadable), new BigDecimal("200.00"))).isEmpty();
    }

    @Test
    void withNoCreditTheTotalIsChargesPlusTaxAndNothingIsCovered() {
        ReceiptTotalResolver.Resolution resolution = resolved("""
                TOTAL CHARGES | 239.99
                TAX | 16.80
                THIS AMOUNT | 256.79
                """, "239.99");

        assertThat(resolution.totalCost()).isEqualByComparingTo("256.79");
        assertThat(resolution.amountCovered()).isNull();
        assertThat(resolution.note()).contains("not the 239.99 first extracted");
    }

    @Test
    void anAgreeingTotalWithNothingCoveredNeedsNoNote() {
        ReceiptTotalResolver.Resolution resolution = resolved("""
                TOTAL CHARGES | 500.00
                AMOUNT DUE | 500.00
                """, "500.00");

        assertThat(resolution.totalCost()).isEqualByComparingTo("500.00");
        assertThat(resolution.note()).isNull();
    }

    @Test
    void twoDocumentsInOneTextAreLeftAlone() {
        assertThat(ReceiptTotalResolver.resolve(PrintedSubtotals.read(BOX + BOX), new BigDecimal("200.00"))).isEmpty();
    }

    @Test
    void withoutAPrintedAmountPaidNothingIsProven() {
        assertThat(ReceiptTotalResolver.resolve(PrintedSubtotals.read("""
                TOTAL CHARGES | 239.99
                LESS INSURANCE | 56.79
                TAX | 16.80
                """), new BigDecimal("200.00"))).isEmpty();
    }
}
