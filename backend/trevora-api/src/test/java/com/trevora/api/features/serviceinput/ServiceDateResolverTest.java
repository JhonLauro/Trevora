package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Telling 11 August from 8 November when the receipt prints {@code 08.11.2026}.
 *
 * <p>The case that prompted this is real and is in the golden set: two people
 * scanned the JFTRUCK sales order and got 2026-08-11 and 2026-11-08 from the
 * same image. Only one of them saw a warning, because only November was in the
 * future - August was silently wrong and looked fine.
 *
 * <p>Like the odometer tests these run against committed OCR text, cost
 * nothing and never flake, which is the whole argument for deciding this in
 * code instead of in the extraction prompt.
 */
class ServiceDateResolverTest {

    /** The day the JFTRUCK receipt was scanned, for the elimination rule. */
    private static final LocalDate SCANNED_ON = LocalDate.of(2026, 9, 4);

    @Test
    @DisplayName("a day above twelve has no second reading and is left alone")
    void anUnambiguousDayIsUntouched() {
        String text = "Date : | 04/30/2025";

        ServiceDateResolver.Resolution resolution =
                ServiceDateResolver.resolve(text, LocalDate.of(2025, 4, 30), SCANNED_ON);

        assertThat(resolution.date()).isEqualTo(LocalDate.of(2025, 4, 30));
        assertThat(resolution.ambiguous()).isFalse();
        assertThat(resolution.note()).isNull();
    }

    @Test
    @DisplayName("a date printed in words settles the numeric one beside it")
    void spelledMonthWins() {
        // The official receipt prints both. The words cannot be misread, so
        // they decide, and a model that read 04/30 as 30 April is corrected.
        String text = """
                Date | 12/04/2025
                Received APR 12 2025
                """;

        ServiceDateResolver.Resolution resolution =
                ServiceDateResolver.resolve(text, LocalDate.of(2025, 12, 4), SCANNED_ON);

        assertThat(resolution.date()).isEqualTo(LocalDate.of(2025, 4, 12));
        assertThat(resolution.note()).contains("printed in words");
    }

    @Test
    @DisplayName("another date on the page declares the document's order")
    void conventionFromAnotherDateOnTheSamePage() {
        // 03/31/2028 can only be month-first, so 08/11/2026 on the same form is
        // 11 August. This is the common case: most receipts print several dates
        // and only one of them needs a component above twelve.
        String text = """
                Date : | 08/11/2026
                Warr Exp | 03/31/2028
                """;

        ServiceDateResolver.Resolution resolution =
                ServiceDateResolver.resolve(text, LocalDate.of(2026, 11, 8), SCANNED_ON);

        assertThat(resolution.date()).isEqualTo(LocalDate.of(2026, 8, 11));
        assertThat(resolution.ambiguous()).isFalse();
        assertThat(resolution.note()).contains("prints the month first");
    }

    @Test
    @DisplayName("a day-first document is read day-first")
    void conventionCanAlsoBeDayFirst() {
        String text = """
                Date : | 08/11/2026
                Issued | 25/12/2025
                """;

        ServiceDateResolver.Resolution resolution =
                ServiceDateResolver.resolve(text, LocalDate.of(2026, 8, 11), SCANNED_ON);

        assertThat(resolution.date()).isEqualTo(LocalDate.of(2026, 11, 8));
        assertThat(resolution.note()).contains("prints the day first");
    }

    @Test
    @DisplayName("two dates disagreeing about the order settle nothing")
    void conflictingWitnessesDecideNothing() {
        // One page cannot be both. Taking the first would be taking one at
        // random, so this falls through to the later signals instead.
        String text = """
                Date : | 08.11.2026
                A | 31/03/2026
                B | 03/31/2026
                """;

        ServiceDateResolver.Resolution resolution =
                ServiceDateResolver.resolve(text, LocalDate.of(2026, 11, 8), SCANNED_ON);

        // Falls to elimination: November 2026 has not happened on 4 September.
        assertThat(resolution.date()).isEqualTo(LocalDate.of(2026, 8, 11));
        assertThat(resolution.note()).contains("has not happened yet");
    }

    @Test
    @DisplayName("a reading in the future is not a reading")
    void futureEliminationDecidesWhenThePageDoesNot() {
        ServiceDateResolver.Resolution resolution = ServiceDateResolver.resolve(
                goldenOcr("jftruck-toledo-sales-order"), LocalDate.of(2026, 11, 8), SCANNED_ON);

        assertThat(resolution.date()).isEqualTo(LocalDate.of(2026, 8, 11));
        assertThat(resolution.ambiguous()).isFalse();
        assertThat(resolution.note()).contains("8 November 2026");
    }

    @Test
    @DisplayName("the run that read the JFTRUCK order correctly is left silent")
    void theCorrectReadingOfTheSameReceiptSaysNothing() {
        // The other half of the bug. Same receipt, the good roll of the dice:
        // the resolver must agree and must not natter about it.
        ServiceDateResolver.Resolution resolution = ServiceDateResolver.resolve(
                goldenOcr("jftruck-toledo-sales-order"), LocalDate.of(2026, 8, 11), SCANNED_ON);

        assertThat(resolution.date()).isEqualTo(LocalDate.of(2026, 8, 11));
        assertThat(resolution.note()).isNull();
    }

    @Test
    @DisplayName("both readings in the past, and the page silent, is admitted")
    void theHouseRuleIsDeclaredRatherThanHidden() {
        // Scanned a year later, November is no longer in the future and nothing
        // eliminates it. Month-first still decides, but the owner is told that
        // it was the house rule and not the receipt talking.
        ServiceDateResolver.Resolution resolution = ServiceDateResolver.resolve(
                goldenOcr("jftruck-toledo-sales-order"),
                LocalDate.of(2026, 11, 8),
                LocalDate.of(2027, 3, 1));

        assertThat(resolution.date()).isEqualTo(LocalDate.of(2026, 8, 11));
        assertThat(resolution.ambiguous()).isTrue();
        assertThat(resolution.note()).contains("nothing else on the receipt says which");
    }

    @Test
    @DisplayName("a version string in the footer is not a date")
    void versionStringsAreNotDates() {
        // The JFTRUCK footer prints 2.0.2106.0 under the totals. Read as a date
        // it would vote on the document's convention and vote wrongly.
        assertThat(ServiceDateResolver.numericTokens("BASE ACCOUNTING SYSTEM\n2.0.2106.0\n")).isEmpty();
    }

    @Test
    @DisplayName("OCR junk shaped like a date is discarded")
    void impossibleComponentsAreDiscarded() {
        // The GTA cooling receipt carries 2026/85/21, which is not a date under
        // either reading.
        assertThat(ServiceDateResolver.numericTokens("2026/85/21")).isEmpty();
    }

    @Test
    @DisplayName("a spelled date is read whichever side the month sits")
    void spelledDatesInEitherOrder() {
        assertThat(ServiceDateResolver.spelledDates("September 22, 2020"))
                .containsExactly(LocalDate.of(2020, 9, 22));
        assertThat(ServiceDateResolver.spelledDates("30 APR 2025"))
                .containsExactly(LocalDate.of(2025, 4, 30));
    }

    @Test
    @DisplayName("a date the text never printed is not second-guessed")
    void aValueWithNoSourceTokenIsKept() {
        // Nothing to transpose when the printing cannot be found. Inventing a
        // swap here would be worse than deferring to the model.
        ServiceDateResolver.Resolution resolution =
                ServiceDateResolver.resolve("no dates here at all", LocalDate.of(2026, 8, 11), SCANNED_ON);

        assertThat(resolution.date()).isEqualTo(LocalDate.of(2026, 8, 11));
        assertThat(resolution.note()).isNull();
    }

    @Test
    @DisplayName("a null date stays null")
    void nothingExtractedStaysNothing() {
        assertThat(ServiceDateResolver.resolve("Date : | 08.11.2026", null, SCANNED_ON).date()).isNull();
    }

    @Test
    @DisplayName("every golden receipt still resolves to its expected date")
    void theGoldenSetIsUnchangedByThis() {
        // The resolver runs on every scan, so its first duty is to leave the
        // cases that were already right exactly as they were.
        assertGolden("talisay-repair-order", LocalDate.of(2025, 4, 30));
        assertGolden("talisay-service-invoice", LocalDate.of(2025, 4, 30));
        assertGolden("talisay-official-receipt", LocalDate.of(2025, 4, 30));
        assertGolden("talisay-picking-slip", LocalDate.of(2025, 4, 30));
        assertGolden("toyota-talisay-body-paint", LocalDate.of(2025, 10, 24));
        assertGolden("scooter-cvt-service", LocalDate.of(2026, 3, 14));
        assertGolden("gta-toledo-cooling", LocalDate.of(2020, 9, 22));
        assertGolden("powerstart-battery-purchase", LocalDate.of(2025, 10, 1));
    }

    /** The expected date survives being passed through the resolver. */
    private static void assertGolden(String caseId, LocalDate expected) {
        assertThat(ServiceDateResolver.resolve(goldenOcr(caseId), expected, SCANNED_ON).date())
                .describedAs(caseId)
                .isEqualTo(expected);
    }

    private static String goldenOcr(String caseId) {
        String resource = "golden/" + caseId + "/ocr.txt";
        try (InputStream stream = ServiceDateResolverTest.class.getClassLoader().getResourceAsStream(resource)) {
            if (stream == null) {
                throw new IllegalStateException("Golden OCR text not found: " + resource);
            }
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }
}
