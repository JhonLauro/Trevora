package com.trevora.api.features.mechanicaccess;

import com.trevora.api.features.vehicle.WarrantyCoverage;
import com.trevora.api.features.vehicle.WarrantyStatus;
import java.time.LocalDate;

/**
 * Warranty cover as a mechanic reading a shared history sees it.
 *
 * <p><b>Why a mechanic gets this at all.</b> Per-record {@code amount_covered}
 * is deliberately withheld from mechanics — that is the owner's financial
 * arrangement with an insurer and no part of a handoff. This is a different
 * kind of fact. Whether a vehicle is still under manufacturer warranty decides
 * whether a shop should open it up: work done outside the dealer network can
 * void cover the owner is still relying on, and a mechanic who cannot see the
 * warranty finds that out afterwards. Being able to answer it is the reason
 * this feature exists.
 *
 * <p><b>What is left out, and why.</b> The status, the limits and the current
 * reading — nothing more. The purchase or delivery date is not here: it says
 * when the owner bought the vehicle and what they may have paid for it, and it
 * answers no question a mechanic has at the counter. Neither is the raw
 * coverage period; {@code expiryDate} is the same information in the form that
 * is actually useful, and it cannot be worked back into a purchase date
 * without the period.
 *
 * <p>Read-only, like everything on a mechanic session, and unverified like
 * everything the owner supplied. The shared view has to say so.
 */
public record MechanicWarrantyResponse(
        WarrantyStatus status,
        boolean expiringSoon,
        LocalDate expiryDate,
        Integer kmLimit,
        Integer currentKm,
        Integer kmRemaining
) {
    public static MechanicWarrantyResponse from(WarrantyCoverage coverage) {
        return new MechanicWarrantyResponse(
                coverage.status(),
                coverage.expiringSoon(),
                coverage.expiryDate(),
                coverage.kmLimit(),
                coverage.currentKm(),
                coverage.kmRemaining()
        );
    }
}
