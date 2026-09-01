package com.trevora.api.features.serviceinput.golden;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The orphan-amount count is the number the skew work will be judged on, so it
 * is worth knowing it counts the right lines before anyone reads it as
 * evidence.
 */
class OcrStabilityReportTest {

    @Test
    void countsAPriceStrandedOnItsOwnLine() {
        String shattered = """
                DISTRIBUTOR TRANSPANDER
                CONDENSER
                950.00
                150.00
                """;

        assertThat(OcrStabilityReport.orphanAmountLines(shattered)).isEqualTo(2);
    }

    @Test
    void doesNotCountAPriceThatStillHasItsDescription() {
        String intact = """
                DISTRIBUTOR TRANSPANDER | P 950.00
                CONDENSER | 150.00
                TOTAL P 3,325.00
                """;

        assertThat(OcrStabilityReport.orphanAmountLines(intact)).isZero();
    }

    @Test
    void countsAStrandedPriceThatKeptItsCurrencySymbolAndColumnPipe() {
        // A price that came unstuck is still printed as a price: the peso sign,
        // the thousands comma and the column separator all travel with it, and
        // a count that missed those would report the failure as fixed.
        assertThat(OcrStabilityReport.orphanAmountLines("| P 3,325.00")).isEqualTo(1);
    }

    @Test
    void ignoresBlankAndSymbolOnlyLines() {
        assertThat(OcrStabilityReport.orphanAmountLines("\n   \n|\nP\n")).isZero();
    }
}
