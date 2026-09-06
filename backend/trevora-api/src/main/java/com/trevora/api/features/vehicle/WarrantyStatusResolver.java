package com.trevora.api.features.vehicle;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Collection;

/**
 * Works out what a vehicle's warranty terms mean today.
 *
 * <p><b>Why this is one class and not two.</b> The same answer is needed by the
 * owner's vehicle page and by the mechanic reading a shared history in a
 * workshop, and those are the two people who must never be told different
 * things about the same car. Computing it once here and projecting it into two
 * response shapes is what stops a rule drifting on one side — the mistake this
 * codebase already made with the odometer, where the vehicle page read a
 * hand-typed column while every other surface read the records.
 *
 * <p><b>Current distance is the highest reading, not the latest.</b> Same rule,
 * and the same reason, as {@link
 * com.trevora.api.features.serviceinput.OdometerResolver}: odometers only
 * increase, so the largest reading is the current one. Receipts are filed out
 * of order — an owner uploading a shoebox of old paperwork enters last year's
 * visit after this month's — and taking the most recently <i>dated</i> record
 * would then report the vehicle as having travelled backwards, which on a
 * warranty screen means quietly handing back kilometres of cover that have
 * already been used.
 *
 * <p><b>Nothing here is verified.</b> These are terms an owner read off their
 * own booklet. No dealer has confirmed them, no brand table backs them, and
 * the resolver has no opinion about what a manufacturer ought to offer. Every
 * screen showing this output has to say where it came from.
 */
public final class WarrantyStatusResolver {

    /**
     * Cover this close to running out is worth a warning rather than a badge.
     *
     * <p>Ninety days and five thousand kilometres are both roughly "the next
     * service visit" — the point at which the decision this feature exists to
     * inform (dealer or local shop) is the one actually in front of the owner.
     */
    static final int EXPIRING_SOON_DAYS = 90;
    static final int EXPIRING_SOON_KM = 5_000;

    private WarrantyStatusResolver() {
    }

    /**
     * The highest odometer reading known for a vehicle.
     *
     * <p>Both sources count. The records are the evidence, but a vehicle with
     * no receipts filed yet still has the reading its owner typed when they
     * added it, and ignoring that would report "no odometer data" to somebody
     * looking at a number on their own screen. Taking the maximum of the two
     * also means a stale typed value can never drag the figure below what the
     * paperwork proves.
     *
     * @return the reading, or null when neither source has one
     */
    public static Integer currentKilometres(Integer typedOdometer, Collection<Integer> recordOdometers) {
        Integer highest = typedOdometer;
        if (recordOdometers != null) {
            for (Integer reading : recordOdometers) {
                if (reading == null) {
                    continue;
                }
                if (highest == null || reading > highest) {
                    highest = reading;
                }
            }
        }
        return highest;
    }

    public static WarrantyCoverage resolve(VehicleProfile vehicle, Integer currentKm) {
        return resolve(vehicle, currentKm, LocalDate.now());
    }

    /**
     * @param today injected rather than read here, so the boundary cases —
     *     expiring today, expiring in exactly ninety days — are testable
     *     without waiting for the calendar
     */
    static WarrantyCoverage resolve(VehicleProfile vehicle, Integer currentKm, LocalDate today) {
        if (vehicle == null) {
            return WarrantyCoverage.notSet(currentKm);
        }

        LocalDate startDate = vehicle.getWarrantyStartDate();
        Integer months = vehicle.getWarrantyMonths();
        Integer kmLimit = vehicle.getWarrantyKmLimit();

        if (startDate == null && months == null && kmLimit == null) {
            return WarrantyCoverage.notSet(currentKm);
        }

        /* Each limit needs both of its halves before it can say anything. A
           period with no date to count from and a distance limit with no
           reading to measure against are equally unusable, and treating either
           as "fine" would be a guess dressed as an answer. */
        LocalDate expiryDate = (startDate != null && months != null)
                ? startDate.plusMonths(months)
                : null;
        Long daysRemaining = expiryDate == null ? null : ChronoUnit.DAYS.between(today, expiryDate);
        Integer kmRemaining = (kmLimit != null && currentKm != null) ? kmLimit - currentKm : null;

        boolean timeKnown = expiryDate != null;
        boolean kmKnown = kmRemaining != null;

        if (!timeKnown && !kmKnown) {
            return new WarrantyCoverage(
                    WarrantyStatus.INCOMPLETE, false, null, null, kmLimit, currentKm, null);
        }

        /* Whichever comes first, and one is enough. A vehicle past its distance
           limit is out of cover however recently it was bought, so this is
           checked before anything that would report cover standing. */
        boolean timeExpired = timeKnown && !today.isBefore(expiryDate);
        boolean kmExpired = kmKnown && kmRemaining <= 0;
        if (timeExpired || kmExpired) {
            return new WarrantyCoverage(
                    WarrantyStatus.EXPIRED, false, expiryDate, daysRemaining, kmLimit, currentKm, kmRemaining);
        }

        WarrantyStatus status;
        if (timeKnown && kmKnown) {
            status = WarrantyStatus.ACTIVE;
        } else if (kmKnown) {
            status = WarrantyStatus.MILEAGE_ONLY;
        } else {
            status = WarrantyStatus.TIME_ONLY;
        }

        /* Composed with the status rather than replacing it, so a vehicle with
           3,000 km left and no purchase date is still MILEAGE_ONLY and still
           warns. Either limit can raise it: whichever dimension is known is
           the one that can run out. */
        boolean expiringSoon = (daysRemaining != null && daysRemaining <= EXPIRING_SOON_DAYS)
                || (kmRemaining != null && kmRemaining < EXPIRING_SOON_KM);

        return new WarrantyCoverage(
                status, expiringSoon, expiryDate, daysRemaining, kmLimit, currentKm, kmRemaining);
    }
}
