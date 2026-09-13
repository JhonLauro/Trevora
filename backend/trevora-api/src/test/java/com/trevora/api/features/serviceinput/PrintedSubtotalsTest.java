package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class PrintedSubtotalsTest {

    /** Verbatim from the Palmetto 57 Nissan upload's OCR, job and totals sections. */
    private static final String PALMETTO = """
            LINE OPCODE | 09:40 11JAN25
            A PERFORM | TECH TYPE HOURS
            1 EE5501 | ENHANCER | 134.27 | 134.27
            PARTS : | SYN / CVT 50T | 27.99 | 27.99 | 27.99
            105.72 | LABOR : | 134.27 | 77.73 | 77.73 | 77.73
            B MULTI | OTHER : | 0.00 | TOTAL LINE A : | 239.99
            115356 ISPN 0.00
            PARTS : | 0.00
            LABOR : | 0.00 OTHER : | ( N / C )
            0.00 | TOTAL LINE B | 0.00
            PARTS : | 0.00 | LABOR : | 0.00 OTHER : | ( N / C )
            0.00 | TOTAL LINE C | 0.00
            ASSUME FOR IT ANY LABOR AMOUNT | 134.27
            ARE ACCESSORIES THOSE WHICH OR MAY ANY BE OFFERED AS PERFOR THE MANUFACTURER | STUTOR PARTS AMOUNT | 105.72
            FOR LOSS HALL GAS ON LUBE | 0.00
            DAMAGES | SUBLET AMOUNT | 0.00
            the Reper Order | charge presents requires 51.00 fee to be cuested for each new | 403 7185 | TOTAL CHARGES | 239.99
            add battery so Desenho to perform the servicesars LESS INSURANCE | 56.79
            and a $ 1.50 to | that you were notified of and authorized inspect the any replaced pea | d by you The | TAX | 16.80
            By signing below , you and acknowledge that you received for had the opportunity of the Amount to Due | SALES
            itemized in this retumet invoice to you in exchange for your payment | AUTHORIZED DEALERSHIP REPRESENTATIVE SIGNATURE | PLEASE PAY
            vehicle is being | CUSTOMER SIGNATURE | THIS AMOUNT | 200.00
            """;

    @Test
    void palmettoReadsTheTotalsBoxAndTheAdjustments() {
        PrintedSubtotals printed = PrintedSubtotals.read(PALMETTO);

        assertThat(printed.split()).isEqualTo(PrintedSubtotals.Split.READ);
        assertThat(printed.parts()).isEqualByComparingTo("105.72");
        assertThat(printed.labour()).isEqualByComparingTo("134.27");
        assertThat(printed.source()).isEqualTo(PrintedSubtotals.Source.TOTALS_BOX);
        // Job A's parts figure is split across two OCR rows, so the per-job source
        // is incomplete and is not compared at all rather than compared wrongly.
        assertThat(printed.sourcesDisagree()).isFalse();
        assertThat(printed.charges()).isEqualByComparingTo("239.99");
        assertThat(printed.tax()).isEqualByComparingTo("16.80");
        assertThat(printed.credits()).isEqualByComparingTo("56.79");
        assertThat(printed.adjustmentsReadable()).isTrue();
    }

    @Test
    void completePerJobFiguresAreSummedWhenThereIsNoTotalsBox() {
        PrintedSubtotals printed = PrintedSubtotals.read("""
                PARTS : | 105.72 | LABOR : | 134.27
                TOTAL LINE A | 239.99
                PARTS : | 10.00
                LABOR : | 0.00 OTHER : | ( N / C )
                TOTAL LINE B | 10.00
                """);

        assertThat(printed.split()).isEqualTo(PrintedSubtotals.Split.READ);
        assertThat(printed.source()).isEqualTo(PrintedSubtotals.Source.PER_JOB);
        assertThat(printed.parts()).isEqualByComparingTo("115.72");
        assertThat(printed.labour()).isEqualByComparingTo("134.27");
    }

    @Test
    void theTotalsBoxWinsAndTheDisagreementIsReported() {
        PrintedSubtotals printed = PrintedSubtotals.read("""
                PARTS : | 90.00 | LABOR : | 134.27
                TOTAL LINE A | 224.27
                LABOR AMOUNT | 134.27
                PARTS AMOUNT | 105.72
                """);

        assertThat(printed.source()).isEqualTo(PrintedSubtotals.Source.TOTALS_BOX);
        assertThat(printed.parts()).isEqualByComparingTo("105.72");
        assertThat(printed.sourcesDisagree()).isTrue();
    }

    @Test
    void printedLabelsWithUnreadableValuesSaySo() {
        PrintedSubtotals printed = PrintedSubtotals.read("""
                LABOR AMOUNT | 134.27
                PARTS AMOUNT | IO5.7Z
                """);

        assertThat(printed.split()).isEqualTo(PrintedSubtotals.Split.UNREADABLE);
        assertThat(printed.parts()).isNull();
        assertThat(printed.labour()).isNull();
    }

    @Test
    void anIncompletePerJobBlockAloneIsUnreadable() {
        PrintedSubtotals printed = PrintedSubtotals.read("""
                PARTS : | SYN / CVT 50T | 27.99
                105.72 | LABOR : | 134.27
                TOTAL LINE A : | 239.99
                """);

        assertThat(printed.split()).isEqualTo(PrintedSubtotals.Split.UNREADABLE);
    }

    @Test
    void aTaxRowWithoutItsAmountMakesTheAdjustmentsUnreadable() {
        PrintedSubtotals printed = PrintedSubtotals.read("""
                TOTAL CHARGES | 239.99
                LESS INSURANCE | 56.79
                TAX | 1b.8O
                PLEASE PAY
                THIS AMOUNT | 200.00
                """);

        assertThat(printed.charges()).isEqualByComparingTo("239.99");
        assertThat(printed.credits()).isEqualByComparingTo("56.79");
        assertThat(printed.tax()).isNull();
        assertThat(printed.adjustmentsReadable()).isFalse();
    }

    @Test
    void rowsAfterTheAmountDueAreNotAdjustments() {
        PrintedSubtotals printed = PrintedSubtotals.read("""
                TOTAL CHARGES | 239.99
                THIS AMOUNT | 239.99
                Less : Withholding Tax | 12.00
                """);

        assertThat(printed.tax()).isNull();
        assertThat(printed.credits()).isNull();
        assertThat(printed.adjustmentsReadable()).isFalse();
    }

    @Test
    void noTextMeansNothingPrinted() {
        assertThat(PrintedSubtotals.read(null)).isEqualTo(PrintedSubtotals.NONE);
        assertThat(PrintedSubtotals.read("  ")).isEqualTo(PrintedSubtotals.NONE);
    }

    /**
     * None of the golden receipts prints a parts and labour split. Their OCR is
     * full of near misses ("Total Labor | 700.00", "LESS DISCOUNT | 0.00",
     * "Less : Withholding Tax | 000", "PARTS FOUND DEFECTIVE") and none of them
     * may produce a warning.
     */
    @Test
    void noGoldenReceiptPrintsASplit() throws IOException {
        List<Path> texts;
        try (Stream<Path> cases = Files.list(Path.of("src/test/resources/golden"))) {
            texts = cases.map(dir -> dir.resolve("ocr.txt")).filter(Files::isReadable).sorted().toList();
        }
        assertThat(texts).isNotEmpty();
        for (Path text : texts) {
            PrintedSubtotals printed = PrintedSubtotals.read(Files.readString(text, StandardCharsets.UTF_8));
            assertThat(printed.split()).as(text.toString()).isEqualTo(PrintedSubtotals.Split.NOT_PRINTED);
            assertThat(printed.charges()).as(text.toString()).isNull();
        }
    }

    @Test
    void metadataCarriesAmountsAsStringsAndOmitsWhatWasNotRead() {
        assertThat(PrintedSubtotals.read(PALMETTO).toMetadata())
                .containsEntry("split", "READ")
                .containsEntry("parts", "105.72")
                .containsEntry("labour", "134.27")
                .containsEntry("source", "TOTALS_BOX")
                .containsEntry("charges", "239.99")
                .containsEntry("tax", "16.80")
                .containsEntry("credits", "56.79")
                .containsEntry("adjustmentsReadable", true);

        assertThat(PrintedSubtotals.NONE.toMetadata())
                .containsOnlyKeys("split", "sourcesDisagree", "adjustmentsReadable")
                .containsEntry("split", "NOT_PRINTED");
        assertThat(new BigDecimal("16.80").toPlainString()).isEqualTo("16.80");
    }
}
