package com.trevora.api.features.serviceinput;

/**
 * Why a receipt photograph was judged unlikely to read well, as a code the
 * receipt screen turns into an instruction the owner can act on.
 *
 * <p>Declared in the order a page's problems are reported, most fundamental
 * first, because only the first is named. A photo that is too small also
 * measures soft, and "move closer" fixes both. A dark or glare-washed photo
 * also measures soft, and "hold steady" would fix neither.
 */
public enum ReceiptQualityIssue {
    /** Too few pixels for the printed text to survive -- "move closer". */
    LOW_RESOLUTION,
    /** Too dark, washed out, or flattened by glare -- "find even light". */
    POOR_LIGHTING,
    /** Out of focus or shaken -- "hold steady". */
    BLURRY,
    /** Tilted past what the OCR layout step straightens -- "straighten the receipt". */
    MISALIGNED;

    /** The code the browser receives, e.g. {@code RECEIPT_BLURRY}. */
    public String code() {
        return "RECEIPT_" + name();
    }
}
