package com.trevora.api.features.vehicle;

import java.time.LocalDate;

/**
 * Everything derived from a vehicle's warranty terms, computed on read.
 *
 * <p>None of this is stored. A saved expiry date would be free to contradict
 * the start date and period it came from the moment either was corrected —
 * the rule migration 010 already applied to out-of-pocket cost.
 *
 * <p>Produced by {@link WarrantyStatusResolver} and projected into two shapes:
 * the owner's, which carries the raw terms back so the edit form can prefill,
 * and the mechanic's, which carries the status and the limits and nothing that
 * would say when the owner bought the vehicle.
 *
 * <p>Every field can be null, and null means "not known" rather than zero.
 * {@code kmRemaining} of 0 is a warranty exactly at its limit; a null one is a
 * warranty whose limit or current reading nobody has recorded.
 *
 * @param status what can honestly be said about cover
 * @param expiringSoon cover still stands but is close to one of its limits;
 *     false whenever cover does not stand, so it never contradicts the status
 * @param expiryDate start date plus period, or null when either is missing
 * @param daysRemaining days from today to {@code expiryDate}; negative once
 *     passed, null when no expiry can be computed
 * @param kmLimit the recorded distance limit, as entered
 * @param currentKm the highest odometer reading known for this vehicle
 * @param kmRemaining {@code kmLimit} minus {@code currentKm}; negative once
 *     passed, null when either side is missing
 */
public record WarrantyCoverage(
        WarrantyStatus status,
        boolean expiringSoon,
        LocalDate expiryDate,
        Long daysRemaining,
        Integer kmLimit,
        Integer currentKm,
        Integer kmRemaining
) {
    /** The answer for a vehicle with no warranty terms recorded at all. */
    static WarrantyCoverage notSet(Integer currentKm) {
        return new WarrantyCoverage(WarrantyStatus.NOT_SET, false, null, null, null, currentKm, null);
    }

    /** Whether cover currently stands, in any of the states that mean it does. */
    public boolean covered() {
        return status == WarrantyStatus.ACTIVE
                || status == WarrantyStatus.MILEAGE_ONLY
                || status == WarrantyStatus.TIME_ONLY;
    }
}
