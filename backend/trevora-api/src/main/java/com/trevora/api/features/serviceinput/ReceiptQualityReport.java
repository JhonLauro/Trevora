package com.trevora.api.features.serviceinput;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * What the quality gate measured on one receipt page, and what it concluded.
 *
 * <p>Two kinds of conclusion. An <b>issue</b> means OCR is unlikely to read the
 * page at all, and in enforce mode it stops the upload until the owner retakes
 * the page or chooses to read it anyway. A <b>warning</b> means the page will
 * probably read, but some of it may be misread: the owner is told and nothing
 * is stopped. Where each line falls was measured against Google Vision itself;
 * see planning/DEFERRED.md, "Receipt quality gate calibrated against Vision".
 *
 * @param checked            false when the image could not be decoded here (HEIC, a CMYK
 *                           JPEG, anything ImageIO has no reader for). Such a page is not
 *                           judged and goes on to OCR exactly as it did before the gate.
 * @param width              pixels, as uploaded
 * @param height             pixels, as uploaded
 * @param sharpness          variance of the Laplacian on a 400px grayscale copy. Kept for
 *                           the record; the verdict uses {@code relativeSharpness}
 * @param brightness         mean gray level of that copy, 0-255
 * @param contrast           standard deviation of its gray levels
 * @param skewDegrees        estimated tilt of the printed rows, or null when the page
 *                           offered too little evidence to say
 * @param relativeSharpness  {@code sharpness} over the square of {@code contrast}. Edge
 *                           strength scales with contrast, so the raw number called faint
 *                           and dark pages blurry although Vision reads them well
 * @param isotropy           0 to 1: how evenly the strongest edges point in every
 *                           direction. Print has edges every way; a shaken photo smears
 *                           them along one
 * @param clippedShare       share of the copy blown out to pure white
 * @param issues             stop the page in enforce mode; most fundamental first
 * @param warnings           reported, never stop anything; most fundamental first
 */
public record ReceiptQualityReport(
        boolean checked,
        int width,
        int height,
        double sharpness,
        double brightness,
        double contrast,
        Double skewDegrees,
        double relativeSharpness,
        double isotropy,
        double clippedShare,
        List<ReceiptQualityIssue> issues,
        List<ReceiptQualityIssue> warnings
) {
    public ReceiptQualityReport {
        issues = issues == null ? List.of() : List.copyOf(issues);
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }

    static ReceiptQualityReport unchecked() {
        return new ReceiptQualityReport(false, 0, 0, 0, 0, 0, null, 0, 1, 0, List.of(), List.of());
    }

    /** True when nothing stops the page. It may still carry warnings. */
    public boolean passed() {
        return issues.isEmpty();
    }

    /** The problem that stops the page, or null when there is none. */
    public ReceiptQualityIssue primaryIssue() {
        return issues.isEmpty() ? null : issues.get(0);
    }

    /** The first thing the owner is warned about, or null. */
    public ReceiptQualityIssue primaryWarning() {
        return warnings.isEmpty() ? null : warnings.get(0);
    }

    /**
     * Kept on the draft's page metadata. A page that passed still carries its
     * numbers, which is what lets the thresholds be tuned against uploads that
     * really happened rather than against guesses.
     */
    public Map<String, Object> toMetadata() {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("checked", checked);
        if (checked) {
            metadata.put("width", width);
            metadata.put("height", height);
            metadata.put("sharpness", round(sharpness));
            metadata.put("brightness", round(brightness));
            metadata.put("contrast", round(contrast));
            metadata.put("skewDegrees", skewDegrees == null ? null : round(skewDegrees));
            metadata.put("relativeSharpness", round3(relativeSharpness));
            metadata.put("isotropy", round3(isotropy));
            metadata.put("clippedShare", round3(clippedShare));
            metadata.put("issues", issues.stream().map(Enum::name).toList());
            metadata.put("warnings", warnings.stream().map(Enum::name).toList());
        }
        return metadata;
    }

    /** One line for the log. */
    public String summary() {
        if (!checked) {
            return "unchecked (could not be decoded)";
        }
        String verdict = passed()
                ? (warnings.isEmpty() ? "passed" : "passed with warnings " + names(warnings))
                : names(issues) + (warnings.isEmpty() ? "" : ", warnings " + names(warnings));
        return String.format(Locale.ROOT,
                "%s (long edge %dpx, relative sharpness %.3f, isotropy %.2f, brightness %.1f, contrast %.1f, "
                        + "clipped %.2f, tilt %s)",
                verdict,
                Math.max(width, height),
                relativeSharpness,
                isotropy,
                brightness,
                contrast,
                clippedShare,
                skewDegrees == null ? "unknown" : String.format(Locale.ROOT, "%.1f deg", skewDegrees));
    }

    private static String names(List<ReceiptQualityIssue> list) {
        return list.stream().map(Enum::name).collect(Collectors.joining("+"));
    }

    private static double round(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private static double round3(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }
}
