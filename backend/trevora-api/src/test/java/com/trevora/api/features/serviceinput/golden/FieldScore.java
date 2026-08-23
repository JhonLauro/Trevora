package com.trevora.api.features.serviceinput.golden;

/**
 * How one field scored on one run.
 *
 * @param field the field name, as it appears in the report
 * @param score 0.0 to 1.0. Binary fields use 0 or 1; set-valued fields use F1.
 * @param skipped true when the case has no checked answer for this field yet,
 *     in which case {@code score} is meaningless and must not be averaged in
 * @param detail what was expected and what came back, for the report
 */
public record FieldScore(String field, double score, boolean skipped, String detail) {

    public static FieldScore hit(String field, String detail) {
        return new FieldScore(field, 1.0, false, detail);
    }

    public static FieldScore miss(String field, String detail) {
        return new FieldScore(field, 0.0, false, detail);
    }

    public static FieldScore partial(String field, double score, String detail) {
        return new FieldScore(field, score, false, detail);
    }

    /** No checked answer yet — listed in the case's {@code pendingGroundTruth}. */
    public static FieldScore pending(String field) {
        return new FieldScore(field, 0.0, true, "no ground truth recorded yet");
    }

    public String mark() {
        if (skipped) {
            return "  -  ";
        }
        if (score >= 0.999) {
            return " PASS";
        }
        if (score <= 0.001) {
            return " FAIL";
        }
        return String.format("  %2.0f%%", score * 100);
    }
}
