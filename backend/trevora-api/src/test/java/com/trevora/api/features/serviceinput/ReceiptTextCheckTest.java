package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * What Vision read, judged for whether it came from a receipt at all. The
 * negatives are shaped like what Vision returned for the drawn non-receipt pictures in
 * calibration (a selfie, a floor, a T-shirt, a letter); the positives like thin
 * receipts it read, which must never be flagged.
 */
class ReceiptTextCheckTest {

    @Test
    @DisplayName("nothing read, or a couple of stray words, is NO_TEXT")
    void strayWordsAreNoText() {
        assertThat(ReceiptTextCheck.assess(null)).isEqualTo(ReceiptQualityIssue.NO_TEXT);
        assertThat(ReceiptTextCheck.assess("   ")).isEqualTo(ReceiptQualityIssue.NO_TEXT);
        assertThat(ReceiptTextCheck.assess("TOYOTA\nABC")).isEqualTo(ReceiptQualityIssue.NO_TEXT);
    }

    @Test
    @DisplayName("text with no money, no date and no receipt words is NO_DOCUMENT")
    void proseIsNoDocument() {
        assertThat(ReceiptTextCheck.assess("JUST DO IT\nNIKE\nAUTHENTIC ATHLETIC DEPT"))
                .isEqualTo(ReceiptQualityIssue.NO_DOCUMENT);
        assertThat(ReceiptTextCheck.assess("Dear Maria, thank you for coming to the party last week"))
                .isEqualTo(ReceiptQualityIssue.NO_DOCUMENT);
    }

    @Test
    @DisplayName("a full receipt passes")
    void receiptPasses() {
        assertThat(ReceiptTextCheck.assess("""
                TOYOTA TALISAY SERVICE CENTER
                DATE 2026-08-11 ODO 45,210 KM
                CHANGE OIL AND FILTER 1,850.00
                TOTAL 5,241.60
                """)).isNull();
    }

    @Test
    @DisplayName("any one sign of a receipt is enough: an amount, a date, or two receipt words")
    void oneSignIsEnough() {
        assertThat(ReceiptTextCheck.assess("Mang Jun vulcanizing shop 350.00")).isNull();
        assertThat(ReceiptTextCheck.assess("Mang Jun vulcanizing shop 1,500")).isNull();
        assertThat(ReceiptTextCheck.assess("Mang Jun vulcanizing shop P350")).isNull();
        assertThat(ReceiptTextCheck.assess("Mang Jun vulcanizing shop ₱ 350")).isNull();
        assertThat(ReceiptTextCheck.assess("Mang Jun vulcanizing shop 08/11/2026")).isNull();
        assertThat(ReceiptTextCheck.assess("Mang Jun vulcanizing shop Aug 11, 2026")).isNull();
        assertThat(ReceiptTextCheck.assess("Mang Jun vulcanizing LABOR PARTS")).isNull();
    }

    @Test
    @DisplayName("a single receipt word alone is not enough; a bare number is not money")
    void weakSignsAreNotEnough() {
        assertThat(ReceiptTextCheck.assess("SERVICE WITH A SMILE ALWAYS"))
                .isEqualTo(ReceiptQualityIssue.NO_DOCUMENT);
        assertThat(ReceiptTextCheck.assess("ROOM 1000 THIRD FLOOR"))
                .isEqualTo(ReceiptQualityIssue.NO_DOCUMENT);
    }
}
