package com.trevora.api.features.serviceinput;

import static com.trevora.api.features.serviceinput.ReceiptTestImages.INK;
import static com.trevora.api.features.serviceinput.ReceiptTestImages.PAPER;
import static com.trevora.api.features.serviceinput.ReceiptTestImages.blurred;
import static com.trevora.api.features.serviceinput.ReceiptTestImages.jpeg;
import static com.trevora.api.features.serviceinput.ReceiptTestImages.receipt;
import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/**
 * The gate against synthetic photographs whose problem is known. Thresholds are
 * the production defaults, so a failure here means the defaults would misjudge
 * an obvious case -- not that a tuned number drifted.
 */
class ReceiptImageQualityGateTest {
    private final ReceiptImageQualityGate gate = new ReceiptImageQualityGate("enforce", 800, 45, 50, 245, 15, 20);

    @Test
    @DisplayName("a sharp, evenly lit, full-size receipt passes")
    void sharpReceiptPasses() {
        ReceiptQualityReport report = gate.assess(jpeg("sharp.jpg", receipt(1500, 2000)));

        assertThat(report.checked()).isTrue();
        assertThat(report.issues()).isEmpty();
        assertThat(report.sharpness()).isGreaterThan(45);
        assertThat(report.width()).isEqualTo(1500);
        assertThat(report.height()).isEqualTo(2000);
    }

    @Test
    @DisplayName("a blurred receipt is BLURRY")
    void blurredReceiptIsBlurry() {
        ReceiptQualityReport report = gate.assess(jpeg("blurry.jpg", blurred(receipt(1500, 2000), 40)));

        assertThat(report.issues()).containsExactly(ReceiptQualityIssue.BLURRY);
        assertThat(report.primaryIssue()).isEqualTo(ReceiptQualityIssue.BLURRY);
    }

    @Test
    @DisplayName("a dark photo is POOR_LIGHTING first, even though it also measures soft")
    void darkPhotoIsPoorLighting() {
        MockMultipartFile dark = jpeg("dark.jpg", receipt(1500, 2000, new Color(0x1E1E1E), new Color(0x0C0C0C), 0));

        ReceiptQualityReport report = gate.assess(dark);

        assertThat(report.brightness()).isLessThan(50);
        assertThat(report.primaryIssue()).isEqualTo(ReceiptQualityIssue.POOR_LIGHTING);
    }

    @Test
    @DisplayName("a washed-out photo is POOR_LIGHTING")
    void washedOutPhotoIsPoorLighting() {
        MockMultipartFile washed = jpeg("glare.jpg", receipt(1500, 2000, new Color(0xFBFBFB), new Color(0xEFEFEF), 0));

        ReceiptQualityReport report = gate.assess(washed);

        assertThat(report.primaryIssue()).isEqualTo(ReceiptQualityIssue.POOR_LIGHTING);
    }

    @Test
    @DisplayName("a tiny photo is LOW_RESOLUTION first")
    void tinyPhotoIsLowResolution() {
        ReceiptQualityReport report = gate.assess(jpeg("tiny.jpg", receipt(600, 450)));

        assertThat(report.primaryIssue()).isEqualTo(ReceiptQualityIssue.LOW_RESOLUTION);
    }

    @Test
    @DisplayName("a long, narrow receipt is judged by its long edge and passes")
    void narrowReceiptPasses() {
        ReceiptQualityReport report = gate.assess(jpeg("thermal.jpg", receipt(700, 2000)));

        assertThat(report.issues()).doesNotContain(ReceiptQualityIssue.LOW_RESOLUTION);
    }

    @Test
    @DisplayName("a straight page measures close to no tilt")
    void straightPageHasNoTilt() {
        ReceiptQualityReport report = gate.assess(jpeg("straight.jpg", receipt(1500, 2000)));

        assertThat(report.skewDegrees()).isNotNull();
        assertThat(Math.abs(report.skewDegrees())).isLessThan(1.5);
    }

    @Test
    @DisplayName("a slightly tilted page is measured and still passes")
    void slightTiltPasses() {
        ReceiptQualityReport report = gate.assess(jpeg("tilt6.jpg", receipt(1500, 2000, PAPER, INK, 6)));

        assertThat(report.skewDegrees()).isNotNull();
        assertThat(Math.abs(report.skewDegrees())).isBetween(4.0, 8.0);
        assertThat(report.issues()).doesNotContain(ReceiptQualityIssue.MISALIGNED);
    }

    @Test
    @DisplayName("a page tilted past the layout step's reach is MISALIGNED")
    void steepTiltIsMisaligned() {
        ReceiptQualityReport report = gate.assess(jpeg("tilt27.jpg", receipt(1500, 2000, PAPER, INK, 27)));

        assertThat(report.issues()).contains(ReceiptQualityIssue.MISALIGNED);
    }

    @Test
    @DisplayName("a file it cannot decode is not judged")
    void undecodableFileIsUnchecked() {
        MockMultipartFile heic = new MockMultipartFile(
                "receiptImages", "page.heic", "image/heic", new byte[] {0, 0, 0, 24, 'f', 't', 'y', 'p', 'h', 'e', 'i', 'c'});

        ReceiptQualityReport report = gate.assess(heic);

        assertThat(report.checked()).isFalse();
        assertThat(report.passed()).isTrue();
    }

    @Test
    @DisplayName("a blank sheet has no rows, so its tilt is unknown rather than guessed")
    void blankSheetHasUnknownTilt() {
        ReceiptQualityReport report = gate.assess(jpeg("blank.jpg", receipt(1500, 2000, PAPER, PAPER, 0)));

        assertThat(report.skewDegrees()).isNull();
        assertThat(report.issues()).doesNotContain(ReceiptQualityIssue.MISALIGNED);
    }

    @Test
    @DisplayName("an unknown mode measures without stopping anything")
    void unknownModeIsShadow() {
        assertThat(new ReceiptImageQualityGate("enforcee", 800, 45, 50, 245, 15, 20).mode())
                .isEqualTo(ReceiptImageQualityGate.Mode.SHADOW);
    }
}
