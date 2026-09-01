package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/**
 * Picking the odometer out of a document that prints several numbers shaped
 * like one.
 *
 * <p>Most of these run against the real OCR text committed in the golden set,
 * because the failure being fixed is not hypothetical: the Toyota repair order
 * prints {@code Kilometers KM 242}, {@code Warr Exp KM 100,000} and
 * {@code MILEAGE 3 KM}, and extraction had been returning 3.
 *
 * <p>They cost nothing and never flake, which is the point of doing this in code
 * rather than in the extraction prompt. The prompt version of this rule was
 * measured three times, changed the score by nothing, and broke the longest
 * document in the set.
 */
class OdometerResolverTest {

    @Test
    void aFormWithThreeOdometerShapedNumbersYieldsTheRealOne() {
        // 242 is the reading. 100,000 is when the warranty ends. 3 is what the
        // odometer said at the PREVIOUS visit, printed in the history block.
        String text = """
                Payment Cash Method | Time : | am / pm | Kilometers KM | Selling Dealer
                Credit | Assignee's Name | 242
                Card | Assignee's Contact No. | Warr Exp KM | Delivery Date
                Cheque | Driver's Name | Date Made : | 100,000 | 03/31/2025
                REPAIR ORDER NO . | 11 | MILEAGE | SERVICE ADVISOR
                03/31/2025 | G7NA058266 | 3 KM | Aaaaaaaa Aaaa Aaaaaaa
                """;

        assertThat(OdometerResolver.resolve(text, 3)).isEqualTo(242);
    }

    @Test
    void theWarrantyLimitIsNeverTheReading() {
        String text = """
                Warr Exp KM | Delivery Date
                Cheque | Driver's Name | 100,000 | 03/31/2025
                """;

        // No reading anywhere, so there is nothing to prefer and the model's
        // answer stands. Inventing 100,000 would be worse than deferring.
        assertThat(OdometerResolver.readingCandidates(text)).isEmpty();
        assertThat(OdometerResolver.resolve(text, null)).isNull();
    }

    @Test
    void aNextServiceTargetIsNotTheReading() {
        // The Mercedes trap: both numbers are plausible and the wrong one is
        // larger, so "prefer the largest" alone would fail. The label is what
        // rejects it first.
        String text = """
                Km Reading | Next Svc Date
                21,055 | 21 May 2027
                Next Svc Km | Colour
                31,055 | BLACK
                """;

        assertThat(OdometerResolver.resolve(text, 31055)).isEqualTo(21055);
    }

    @Test
    void aHistoricReadingLosesToTheCurrentOneBecauseOdometersOnlyIncrease() {
        String text = """
                MILEAGE
                3 KM
                Kilometers KM
                242
                """;

        assertThat(OdometerResolver.resolve(text, 3)).isEqualTo(242);
    }

    @Test
    void aDocumentWithNoOdometerLabelIsLeftAlone() {
        // An official receipt prints amounts and no reading. The resolver must
        // not manufacture one out of a peso figure.
        String text = """
                Total Sales ( VAT Inclusive ) | 3,106.49
                VAT Amount | 332.84
                """;

        assertThat(OdometerResolver.readingCandidates(text)).isEmpty();
        assertThat(OdometerResolver.resolve(text, null)).isNull();
    }

    @Test
    void anImplausibleNumberIsNotAReading() {
        // A customer account number sitting under a mileage label. Ten digits is
        // not a distance any vehicle has travelled.
        String text = """
                Customer No | Mileage
                3000000000
                """;

        assertThat(OdometerResolver.readingCandidates(text)).isEmpty();
    }

    @Test
    void theRealRepairOrderResolvesTo242() {
        assertThat(OdometerResolver.resolve(goldenOcr("talisay-repair-order"), 3)).isEqualTo(242);
    }

    @Test
    void theRealSkewedRepairOrderResolvesTo242() {
        assertThat(OdometerResolver.resolve(goldenOcr("talisay-repair-order-skewed"), 100000))
                .isEqualTo(242);
    }

    @Test
    void theRealPickingSlipResolvesTo242() {
        assertThat(OdometerResolver.resolve(goldenOcr("talisay-picking-slip"), 242)).isEqualTo(242);
    }

    @Test
    void theRealOfficialReceiptOffersNoReadingToPrefer() {
        // It prints no odometer at all, so whatever the model said stands - and
        // the correct answer there is nothing.
        assertThat(OdometerResolver.readingCandidates(goldenOcr("talisay-official-receipt"))).isEmpty();
        assertThat(OdometerResolver.resolve(goldenOcr("talisay-official-receipt"), null)).isNull();
    }

    private static String goldenOcr(String caseId) {
        String resource = "golden/" + caseId + "/ocr.txt";
        try (InputStream stream = OdometerResolverTest.class.getClassLoader().getResourceAsStream(resource)) {
            if (stream == null) {
                throw new IllegalStateException("Golden OCR text not found: " + resource);
            }
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }
}
