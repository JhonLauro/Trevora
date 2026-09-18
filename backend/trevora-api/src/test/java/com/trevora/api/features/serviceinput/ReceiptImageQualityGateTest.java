package com.trevora.api.features.serviceinput;

import static com.trevora.api.features.serviceinput.ReceiptTestImages.INK;
import static com.trevora.api.features.serviceinput.ReceiptTestImages.PAPER;
import static com.trevora.api.features.serviceinput.ReceiptTestImages.blurred;
import static com.trevora.api.features.serviceinput.ReceiptTestImages.jpeg;
import static com.trevora.api.features.serviceinput.ReceiptTestImages.receipt;
import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/**
 * The gate against synthetic photographs whose problem is known. Thresholds are
 * the production defaults, so a failure here means the defaults would misjudge
 * an obvious case -- not that a tuned number drifted.
 *
 * <p>Two tiers: {@code issues} stop the upload, {@code warnings} are only shown.
 * Only what Vision could not read in calibration blocks; the rest warns.
 */
class ReceiptImageQualityGateTest {
    private final ReceiptImageQualityGate gate = new ReceiptImageQualityGate("enforce");

    @Test
    @DisplayName("a sharp, evenly lit, full-size receipt passes with nothing to say")
    void sharpReceiptPasses() {
        ReceiptQualityReport report = gate.assess(jpeg("sharp.jpg", receipt(1500, 2000)));

        assertThat(report.checked()).isTrue();
        assertThat(report.issues()).isEmpty();
        assertThat(report.warnings()).isEmpty();
        assertThat(report.relativeSharpness()).isGreaterThan(2.5);
        assertThat(report.isotropy()).isGreaterThan(0.68);
        assertThat(report.width()).isEqualTo(1500);
        assertThat(report.height()).isEqualTo(2000);
    }

    @Test
    @DisplayName("a thoroughly blurred receipt is blocked as BLURRY")
    void blurredReceiptIsBlocked() {
        ReceiptQualityReport report = gate.assess(jpeg("blurry.jpg", blurred(receipt(1500, 2000), 40)));

        assertThat(report.issues()).containsExactly(ReceiptQualityIssue.BLURRY);
        assertThat(report.primaryIssue()).isEqualTo(ReceiptQualityIssue.BLURRY);
        assertThat(report.passed()).isFalse();
    }

    @Test
    @DisplayName("a camera shaken sideways is caught by the direction of its edges")
    void shakenReceiptIsCaught() {
        ReceiptQualityReport report = gate.assess(jpeg("shake.jpg", shaken(receipt(1500, 2000), 24)));

        assertThat(report.isotropy()).isLessThan(0.68);
        assertThat(report.issues().contains(ReceiptQualityIssue.BLURRY)
                || report.warnings().contains(ReceiptQualityIssue.BLURRY)).isTrue();
    }

    @Test
    @DisplayName("a dim photo with faint print is only warned about: Vision still reads it")
    void dimPhotoIsWarned() {
        MockMultipartFile dim = jpeg("dim.jpg", receipt(1500, 2000, new Color(0x1E1E1E), new Color(0x0C0C0C), 0));

        ReceiptQualityReport report = gate.assess(dim);

        assertThat(report.warnings()).contains(ReceiptQualityIssue.POOR_LIGHTING);
        assertThat(report.issues()).doesNotContain(ReceiptQualityIssue.POOR_LIGHTING);
    }

    @Test
    @DisplayName("a nearly black frame is blocked as POOR_LIGHTING")
    void blackFrameIsBlocked() {
        MockMultipartFile black = jpeg("black.jpg", receipt(1500, 2000, new Color(0x050505), new Color(0x020202), 0));

        ReceiptQualityReport report = gate.assess(black);

        assertThat(report.primaryIssue()).isEqualTo(ReceiptQualityIssue.POOR_LIGHTING);
    }

    @Test
    @DisplayName("a washed-out page with barely any print is warned, not blocked")
    void washedOutPhotoIsWarned() {
        MockMultipartFile washed = jpeg("washed.jpg", receipt(1500, 2000, new Color(0xFBFBFB), new Color(0xEFEFEF), 0));

        ReceiptQualityReport report = gate.assess(washed);

        assertThat(report.warnings()).contains(ReceiptQualityIssue.POOR_LIGHTING);
        assertThat(report.issues()).doesNotContain(ReceiptQualityIssue.POOR_LIGHTING);
    }

    @Test
    @DisplayName("glare never blocks, however much of the page is blown out")
    void glareOnlyWarns() {
        BufferedImage image = receipt(1500, 2000);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 1500, 1000);
        g.dispose();

        ReceiptQualityReport report = gate.assess(jpeg("glare.jpg", image));

        assertThat(report.clippedShare()).isGreaterThan(0.15);
        assertThat(report.warnings()).contains(ReceiptQualityIssue.GLARE);
        assertThat(report.issues()).doesNotContain(ReceiptQualityIssue.GLARE);
    }

    @Test
    @DisplayName("a small photo is warned about, a tiny one is blocked")
    void resolutionHasTwoTiers() {
        ReceiptQualityReport small = gate.assess(jpeg("small.jpg", receipt(600, 450)));
        ReceiptQualityReport tiny = gate.assess(jpeg("tiny.jpg", receipt(380, 300)));

        assertThat(small.primaryWarning()).isEqualTo(ReceiptQualityIssue.LOW_RESOLUTION);
        assertThat(small.issues()).doesNotContain(ReceiptQualityIssue.LOW_RESOLUTION);
        assertThat(tiny.primaryIssue()).isEqualTo(ReceiptQualityIssue.LOW_RESOLUTION);
    }

    @Test
    @DisplayName("a long, narrow receipt is judged by its long edge and passes")
    void narrowReceiptPasses() {
        ReceiptQualityReport report = gate.assess(jpeg("thermal.jpg", receipt(700, 2000)));

        assertThat(report.issues()).doesNotContain(ReceiptQualityIssue.LOW_RESOLUTION);
        assertThat(report.warnings()).doesNotContain(ReceiptQualityIssue.LOW_RESOLUTION);
    }

    @Test
    @DisplayName("a straight page measures close to no tilt")
    void straightPageHasNoTilt() {
        ReceiptQualityReport report = gate.assess(jpeg("straight.jpg", receipt(1500, 2000)));

        assertThat(report.skewDegrees()).isNotNull();
        assertThat(Math.abs(report.skewDegrees())).isLessThan(1.5);
    }

    @Test
    @DisplayName("a tilted page is measured and passes: Vision read pages turned 27 degrees")
    void tiltPasses() {
        ReceiptQualityReport slight = gate.assess(jpeg("tilt6.jpg", receipt(1500, 2000, PAPER, INK, 6)));
        ReceiptQualityReport steep = gate.assess(jpeg("tilt27.jpg", receipt(1500, 2000, PAPER, INK, 27)));

        assertThat(slight.skewDegrees()).isNotNull();
        assertThat(Math.abs(slight.skewDegrees())).isBetween(4.0, 8.0);
        assertThat(slight.warnings()).doesNotContain(ReceiptQualityIssue.MISALIGNED);
        assertThat(steep.issues()).doesNotContain(ReceiptQualityIssue.MISALIGNED);
    }

    @Test
    @DisplayName("a warning never fails the page")
    void warningsPass() {
        ReceiptQualityReport report = gate.assess(jpeg("small.jpg", receipt(600, 450)));

        assertThat(report.warnings()).isNotEmpty();
        assertThat(report.passed()).isTrue();
    }

    @Test
    @DisplayName("a file it cannot decode is not judged")
    void undecodableFileIsUnchecked() {
        MockMultipartFile heic = new MockMultipartFile(
                "receiptImages", "page.heic", "image/heic", new byte[] {0, 0, 0, 24, 'f', 't', 'y', 'p', 'h', 'e', 'i', 'c'});

        ReceiptQualityReport report = gate.assess(heic);

        assertThat(report.checked()).isFalse();
        assertThat(report.passed()).isTrue();
        assertThat(report.warnings()).isEmpty();
    }

    @Test
    @DisplayName("a blank sheet has no rows, so its tilt is unknown rather than guessed")
    void blankSheetHasUnknownTilt() {
        ReceiptQualityReport report = gate.assess(jpeg("blank.jpg", receipt(1500, 2000, PAPER, PAPER, 0)));

        assertThat(report.skewDegrees()).isNull();
        assertThat(report.warnings()).doesNotContain(ReceiptQualityIssue.MISALIGNED);
        assertThat(report.isotropy()).isEqualTo(1.0);
    }

    @Test
    @DisplayName("custom limits are honoured: a stricter blur line blocks what the default only warns about")
    void customLimits() {
        ReceiptImageQualityGate.Limits d = ReceiptImageQualityGate.Limits.defaults();
        ReceiptImageQualityGate strict = new ReceiptImageQualityGate("enforce", new ReceiptImageQualityGate.Limits(
                d.warnMinLongEdge(), 700, d.warnMinBrightness(), d.blockMinBrightness(), d.warnMinContrast(),
                d.warnClippedShare(), d.warnMinRelativeSharpness(), d.blockMinRelativeSharpness(),
                d.warnMinIsotropy(), d.blockMinIsotropy(), d.warnMaxSkewDegrees()));

        assertThat(strict.assess(jpeg("small.jpg", receipt(600, 450))).primaryIssue())
                .isEqualTo(ReceiptQualityIssue.LOW_RESOLUTION);
    }

    @Test
    @DisplayName("an unknown mode measures without stopping anything")
    void unknownModeIsShadow() {
        assertThat(new ReceiptImageQualityGate("enforcee").mode())
                .isEqualTo(ReceiptImageQualityGate.Mode.SHADOW);
    }

    /** Averages each pixel with its neighbours across one row: a camera moved sideways. */
    private static BufferedImage shaken(BufferedImage source, int reach) {
        int w = source.getWidth();
        int h = source.getHeight();
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        int[] row = new int[w];
        int[] smeared = new int[w];
        for (int y = 0; y < h; y++) {
            source.getRGB(0, y, w, 1, row, 0, w);
            long[] prefix = new long[w + 1];
            for (int x = 0; x < w; x++) {
                prefix[x + 1] = prefix[x] + (row[x] & 0xFF);
            }
            for (int x = 0; x < w; x++) {
                int lo = Math.max(0, x - reach);
                int hi = Math.min(w - 1, x + reach);
                int v = (int) ((prefix[hi + 1] - prefix[lo]) / (hi - lo + 1));
                smeared[x] = 0xFF000000 | (v << 16) | (v << 8) | v;
            }
            out.setRGB(0, y, w, 1, smeared, 0, w);
        }
        return out;
    }
}
