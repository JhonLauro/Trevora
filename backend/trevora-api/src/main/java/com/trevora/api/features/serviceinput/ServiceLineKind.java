package com.trevora.api.features.serviceinput;

/**
 * What a single printed line on a receipt actually is.
 *
 * <p>The distinction exists because only one of these four says anything about
 * which part of the vehicle was serviced. A Toyota body-and-paint invoice bills
 * a painting job, a floor mat, and eleven separate consumables — thinner,
 * masking tape, rubbing compound, waste pads. Read as one undifferentiated
 * list, "WASTE PAD" reads as brake work and the owner is shown a brake service
 * they never had.
 *
 * <p><b>Only {@link #OPERATION} may drive component attribution.</b> Parts are
 * evidence of what was fitted, materials and fees are evidence of nothing
 * beyond cost, and anything that infers a serviced component from a can of
 * degreaser is guessing.
 *
 * <p>Lives in {@code serviceinput} because extraction is where a line's kind is
 * first decided; {@code servicerecord} imports it, the same way it imports
 * {@link InputMethod}.
 */
public enum ServiceLineKind {
    /** Labour the shop performed. The only kind that identifies a component. */
    OPERATION,

    /** A component fitted to the vehicle and still on it afterwards. */
    PART,

    /**
     * Consumed doing the work and not part of the vehicle — paint, thinner,
     * tape, cleaner, rags, filler.
     */
    MATERIAL,

    /**
     * Charged but neither: disposal, shop supplies, towing, diagnostic fees.
     * Present so that every priced line has somewhere to go — dropping charges
     * would make the lines impossible to reconcile against the invoice total.
     */
    FEE;

    /**
     * @return the kind named by {@code value}, or {@link #MATERIAL} when it is
     *     null or unrecognised. Materials is the conservative default: guessing
     *     PART would add a component the vehicle may not have, and guessing
     *     OPERATION would let the line light up the parts map.
     */
    public static ServiceLineKind fromNullable(String value) {
        if (value == null || value.isBlank()) {
            return MATERIAL;
        }
        try {
            return valueOf(value.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            return MATERIAL;
        }
    }
}
