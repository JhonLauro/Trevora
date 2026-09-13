package com.trevora.api.features.serviceinput;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * What the quality gate measured on one receipt page, and what it concluded.
 *
 * @param checked      false when the image could not be decoded here (HEIC, a CMYK
 *                     JPEG, anything ImageIO has no reader for). Such a page is not
 *                     judged and goes on to OCR exactly as it did before the gate.
 * @param width        pixels, as uploaded
 * @param height       pixels, as uploaded
 * @param sharpness    variance of the Laplacian on a 400px grayscale copy -- the
 *                     same measure, at the same size, as the receipt screen's own
 * @param brightness   mean gray level of that copy, 0-255
 * @param contrast     standard deviation of its gray levels
 * @param skewDegrees  estimated tilt of the printed rows, or null when the page
 *                     offered too little evidence to say
 * @param issues       empty when the page passed; most fundamental problem first
 */
public record ReceiptQualityReport(
        boolean checked,
        int width,
        int height,
        double sharpness,
        double brightness,
        double contrast,
        Double skewDegrees,
        List<ReceiptQualityIssue> issues
) {
    public ReceiptQualityReport {
        issues = issues == null ? List.of() : List.copyOf(issues);
    }

    static ReceiptQualityReport unchecked() {
        return new ReceiptQualityReport(false, 0, 0, 0, 0, 0, null, List.of());
    }

    public boolean passed() {
        return issues.isEmpty();
    }

    /** The problem the owner is told about, or null when there is none. */
    public ReceiptQualityIssue primaryIssue() {
        return issues.isEmpty() ? null : issues.get(0);
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
            metadata.put("issues", issues.stream().map(Enum::name).toList());
        }
        return metadata;
    }

    /** One line for the log. */
    public String summary() {
        if (!checked) {
            return "unchecked (could not be decoded)";
        }
        return String.format(Locale.ROOT,
                "%s (long edge %dpx, sharpness %.1f, brightness %.1f, contrast %.1f, tilt %s)",
                passed() ? "passed" : issues.stream().map(Enum::name).collect(Collectors.joining("+")),
                Math.max(width, height),
                sharpness,
                brightness,
                contrast,
                skewDegrees == null ? "unknown" : String.format(Locale.ROOT, "%.1f deg", skewDegrees));
    }

    private static double round(double value) {
        return Math.round(value * 10.0) / 10.0;
    }
}
