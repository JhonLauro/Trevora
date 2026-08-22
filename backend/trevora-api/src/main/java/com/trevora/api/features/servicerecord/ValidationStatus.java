package com.trevora.api.features.servicerecord;

/**
 * Whether a human is accountable for a confirmed record's fields.
 *
 * Not a quality judgement. NEEDS_REVIEW does not mean the data is wrong — it
 * means a machine produced it and nobody has checked. The distinction is the
 * project's answer to whether the history can be trusted, so it is recorded
 * rather than assumed.
 */
public enum ValidationStatus {
    /** Typed by the owner, corrected during review, or marked reviewed afterwards. */
    VALIDATED,

    /** Extracted by OCR or speech-to-text and confirmed with nothing corrected. */
    NEEDS_REVIEW
}
