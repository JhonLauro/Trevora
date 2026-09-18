package com.trevora.api.features.serviceinput;

/**
 * Why a receipt photograph was judged unlikely to read well, as a code the
 * receipt screen turns into an instruction the owner can act on.
 *
 * <p>Declared in the order a page's problems are reported, most fundamental
 * first, because only the first is named. A photo that is too small also
 * measures soft, and "move closer" fixes both. A dark or glare-washed photo
 * also measures soft, and "hold steady" would fix neither.
 *
 * <p>The first five are judged from the pixels, before anything is paid for.
 * The last two can only be judged from what OCR read, so they are raised after
 * Vision and before the AI extraction.
 */
public enum ReceiptQualityIssue {
    /** Too few pixels for the printed text to survive -- "move closer". */
    LOW_RESOLUTION,
    /** Too dark, or the print too faint against the paper -- "find even light". */
    POOR_LIGHTING,
    /** Part of the page blown out to white by a flash or a lamp -- "tilt away from the light". */
    GLARE,
    /** Out of focus or shaken -- "hold steady". */
    BLURRY,
    /** Tilted further than the OCR reads reliably -- "straighten the receipt". */
    MISALIGNED,
    /** OCR found next to no writing: a photo of something other than paper. */
    NO_TEXT,
    /** OCR found writing, but nothing a receipt carries: no amount, no date, no receipt words. */
    NO_DOCUMENT;

    /** The code the browser receives, e.g. {@code RECEIPT_BLURRY}. */
    public String code() {
        return "RECEIPT_" + name();
    }
}
