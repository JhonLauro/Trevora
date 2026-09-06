package com.trevora.api.features.vehicle;

/**
 * What can honestly be said about a vehicle's manufacturer warranty.
 *
 * <p><b>The partial values are the reason this is an enum and not a boolean.</b>
 * Warranty terms arrive in pieces: a booklet states "3 years or 100,000 km"
 * while the delivery date sits on paperwork the owner no longer has, and an
 * odometer reading exists only once a receipt has been filed. Collapsing that
 * into covered/not-covered would mean either inventing the missing half or
 * discarding the half that is known. Both are worse than saying which half we
 * have.
 *
 * <p>Whether cover is close to running out is deliberately <i>not</i> a value
 * here. It composes with every state below in which cover still stands, so as
 * a sixth constant it would have had to displace one of them — and the state it
 * would displace is {@link #MILEAGE_ONLY}, which is exactly the case where a
 * vehicle with 3,000 km left and no purchase date would have shown no warning
 * at all. It is {@code expiringSoon} on {@link WarrantyCoverage} instead.
 */
public enum WarrantyStatus {
    /** No warranty field has been filled in. The tab offers to collect them. */
    NOT_SET,

    /**
     * Something was entered, but neither limit can be evaluated.
     *
     * <p>A period with no start date to count from; a distance limit with no
     * odometer reading anywhere on the vehicle. Both are ordinary — somebody
     * fills in one field and saves, or records a limit before filing a single
     * receipt — and neither is {@link #NOT_SET}: telling an owner who just
     * typed "100,000 km" that they have recorded nothing is a lie about their
     * own input, and the screen would then offer to collect what it already
     * holds. What is missing is named on screen so it can be supplied.
     */
    INCOMPLETE,

    /** Both limits are known and neither has been reached. */
    ACTIVE,

    /**
     * A limit has been passed — whichever came first.
     *
     * <p>One exceeded limit is enough. A vehicle past 100,000 km is out of
     * cover however long ago it was bought.
     */
    EXPIRED,

    /**
     * Distance is known and still within the limit; time cannot be judged.
     *
     * <p>The purchase or delivery date is missing, so no expiry date exists to
     * compare today against. Cover may already have run out on time and this
     * cannot see it, which is why the screen says so rather than showing a
     * confident badge.
     */
    MILEAGE_ONLY,

    /**
     * Time is known and has not run out; distance cannot be judged.
     *
     * <p>Either no distance limit was recorded or no odometer reading exists
     * on this vehicle yet. Same caution as {@link #MILEAGE_ONLY}, in the other
     * direction.
     */
    TIME_ONLY
}
