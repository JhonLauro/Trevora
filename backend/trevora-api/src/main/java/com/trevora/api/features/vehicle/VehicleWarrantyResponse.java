package com.trevora.api.features.vehicle;

import java.time.LocalDate;

/**
 * The warranty block on the owner's own vehicle response.
 *
 * <p>Carries the terms back as entered as well as what they mean, because this
 * is what the edit form prefills from — a form that could not read back what
 * was saved would make every correction a re-entry.
 *
 * <p>The mechanic's copy is {@link
 * com.trevora.api.features.mechanicaccess.MechanicWarrantyResponse} and is
 * deliberately narrower.
 */
public record VehicleWarrantyResponse(
        WarrantyStatus status,
        boolean expiringSoon,
        LocalDate startDate,
        Integer months,
        Integer kmLimit,
        LocalDate expiryDate,
        Long daysRemaining,
        Integer currentKm,
        Integer kmRemaining
) {
    public static VehicleWarrantyResponse from(VehicleProfile vehicle, WarrantyCoverage coverage) {
        return new VehicleWarrantyResponse(
                coverage.status(),
                coverage.expiringSoon(),
                vehicle.getWarrantyStartDate(),
                vehicle.getWarrantyMonths(),
                coverage.kmLimit(),
                coverage.expiryDate(),
                coverage.daysRemaining(),
                coverage.currentKm(),
                coverage.kmRemaining()
        );
    }
}
