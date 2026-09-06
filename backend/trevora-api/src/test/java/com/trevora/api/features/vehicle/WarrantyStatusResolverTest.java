package com.trevora.api.features.vehicle;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * What warranty terms mean today, and what they do not mean.
 *
 * <p>The cases worth having are the partial ones. Whether a car with a full set
 * of terms and eighty thousand kilometres is covered is arithmetic; whether a
 * car with three thousand kilometres left and no purchase date on file gets a
 * warning is a design decision that has already been got wrong once — cover
 * running low was briefly a status of its own, which meant the state where only
 * distance is known outranked it and that car was shown nothing at all.
 */
class WarrantyStatusResolverTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 6);

    private static VehicleProfile vehicle(LocalDate start, Integer months, Integer kmLimit) {
        VehicleProfile vehicle = new VehicleProfile();
        vehicle.setWarrantyStartDate(start);
        vehicle.setWarrantyMonths(months);
        vehicle.setWarrantyKmLimit(kmLimit);
        return vehicle;
    }

    @Test
    void reportsNotSetWhenNoTermsRecorded() {
        WarrantyCoverage coverage = WarrantyStatusResolver.resolve(vehicle(null, null, null), 42_300, TODAY);

        assertThat(coverage.status()).isEqualTo(WarrantyStatus.NOT_SET);
        assertThat(coverage.expiringSoon()).isFalse();
        // The distance is still reported: it is a fact about the vehicle, not
        // about the warranty, and the odometer tile reads it either way.
        assertThat(coverage.currentKm()).isEqualTo(42_300);
    }

    @Test
    void reportsActiveWithBothLimitsKnownAndNeitherReached() {
        WarrantyCoverage coverage = WarrantyStatusResolver.resolve(
                vehicle(LocalDate.of(2025, 3, 14), 36, 100_000), 42_300, TODAY);

        assertThat(coverage.status()).isEqualTo(WarrantyStatus.ACTIVE);
        assertThat(coverage.expiryDate()).isEqualTo(LocalDate.of(2028, 3, 14));
        assertThat(coverage.kmRemaining()).isEqualTo(57_700);
        assertThat(coverage.expiringSoon()).isFalse();
    }

    @Test
    void expiresOnDistanceWhileTimeStillRuns() {
        WarrantyCoverage coverage = WarrantyStatusResolver.resolve(
                vehicle(LocalDate.of(2025, 3, 14), 36, 100_000), 104_000, TODAY);

        assertThat(coverage.status()).isEqualTo(WarrantyStatus.EXPIRED);
        assertThat(coverage.kmRemaining()).isNegative();
        // Whichever came first. Nothing about an unexpired date may soften it.
        assertThat(coverage.expiringSoon()).isFalse();
    }

    @Test
    void expiresOnTimeWhileDistanceStillRuns() {
        WarrantyCoverage coverage = WarrantyStatusResolver.resolve(
                vehicle(LocalDate.of(2020, 1, 1), 36, 100_000), 40_000, TODAY);

        assertThat(coverage.status()).isEqualTo(WarrantyStatus.EXPIRED);
        assertThat(coverage.kmRemaining()).isEqualTo(60_000);
    }

    /** A warranty runs out at the end of its last day, so the expiry date is not one of them. */
    @Test
    void expiresOnTheExpiryDateItself() {
        VehicleProfile vehicle = vehicle(LocalDate.of(2023, 9, 6), 36, null);

        assertThat(WarrantyStatusResolver.resolve(vehicle, null, TODAY.minusDays(1)).status())
                .isEqualTo(WarrantyStatus.TIME_ONLY);
        assertThat(WarrantyStatusResolver.resolve(vehicle, null, TODAY).status())
                .isEqualTo(WarrantyStatus.EXPIRED);
    }

    @Test
    void reportsMileageOnlyWhenThePurchaseDateIsMissing() {
        WarrantyCoverage coverage = WarrantyStatusResolver.resolve(vehicle(null, 36, 100_000), 42_300, TODAY);

        assertThat(coverage.status()).isEqualTo(WarrantyStatus.MILEAGE_ONLY);
        assertThat(coverage.expiryDate()).isNull();
        assertThat(coverage.daysRemaining()).isNull();
        assertThat(coverage.kmRemaining()).isEqualTo(57_700);
    }

    @Test
    void reportsTimeOnlyWhenNoOdometerReadingExists() {
        WarrantyCoverage coverage = WarrantyStatusResolver.resolve(
                vehicle(LocalDate.of(2025, 3, 14), 36, 100_000), null, TODAY);

        assertThat(coverage.status()).isEqualTo(WarrantyStatus.TIME_ONLY);
        assertThat(coverage.kmRemaining()).isNull();
    }

    /**
     * The case the separate flag exists for.
     *
     * <p>As a status value this lost to MILEAGE_ONLY, and the owner of a car
     * with three thousand kilometres of cover left saw no warning at all.
     */
    @Test
    void warnsOnLowDistanceEvenWithNoPurchaseDate() {
        WarrantyCoverage coverage = WarrantyStatusResolver.resolve(vehicle(null, null, 100_000), 97_000, TODAY);

        assertThat(coverage.status()).isEqualTo(WarrantyStatus.MILEAGE_ONLY);
        assertThat(coverage.expiringSoon()).isTrue();
    }

    @Test
    void warnsOnNearExpiryEvenWithNoOdometerData() {
        WarrantyCoverage coverage = WarrantyStatusResolver.resolve(
                vehicle(TODAY.minusMonths(36).plusDays(30), 36, null), null, TODAY);

        assertThat(coverage.status()).isEqualTo(WarrantyStatus.TIME_ONLY);
        assertThat(coverage.expiringSoon()).isTrue();
    }

    @Test
    void doesNotWarnJustOutsideEitherThreshold() {
        WarrantyCoverage coverage = WarrantyStatusResolver.resolve(
                vehicle(TODAY.minusMonths(36).plusDays(91), 36, 100_000), 94_000, TODAY);

        assertThat(coverage.status()).isEqualTo(WarrantyStatus.ACTIVE);
        assertThat(coverage.daysRemaining()).isEqualTo(91);
        assertThat(coverage.kmRemaining()).isEqualTo(6_000);
        assertThat(coverage.expiringSoon()).isFalse();
    }

    /**
     * Terms entered, nothing evaluable. Reported as its own state rather than
     * as NOT_SET: telling an owner who just typed a mileage limit that they
     * have recorded nothing is a lie about their own input, and the tab would
     * then offer to collect what it is already holding.
     */
    @Test
    void reportsIncompleteWhenTermsCannotBeEvaluated() {
        WarrantyCoverage kmLimitButNoReading = WarrantyStatusResolver.resolve(
                vehicle(null, null, 100_000), null, TODAY);
        assertThat(kmLimitButNoReading.status()).isEqualTo(WarrantyStatus.INCOMPLETE);
        // The limit is carried through so the screen can show what was entered.
        assertThat(kmLimitButNoReading.kmLimit()).isEqualTo(100_000);
        assertThat(kmLimitButNoReading.covered()).isFalse();

        WarrantyCoverage dateWithoutPeriod = WarrantyStatusResolver.resolve(
                vehicle(LocalDate.of(2025, 3, 14), null, null), null, TODAY);
        assertThat(dateWithoutPeriod.status()).isEqualTo(WarrantyStatus.INCOMPLETE);
    }

    /**
     * The highest reading, not the latest one.
     *
     * <p>Receipts are filed out of order, so ordering by date and taking the
     * newest reports a vehicle travelling backwards — and on this screen that
     * hands back kilometres of cover which have already been used.
     */
    @Test
    void currentDistanceIsTheHighestReadingAcrossEverySource() {
        assertThat(WarrantyStatusResolver.currentKilometres(12_000, List.of(88_000, 45_000, 91_400)))
                .isEqualTo(91_400);
    }

    @Test
    void currentDistanceFallsBackToTheTypedReadingWhenNoRecordCarriesOne() {
        assertThat(WarrantyStatusResolver.currentKilometres(12_000, List.of())).isEqualTo(12_000);
        assertThat(WarrantyStatusResolver.currentKilometres(12_000, Arrays.asList((Integer) null, null)))
                .isEqualTo(12_000);
    }

    /** A stale typed value must never drag the figure below what the paperwork proves. */
    @Test
    void currentDistanceIgnoresATypedReadingLowerThanTheRecords() {
        assertThat(WarrantyStatusResolver.currentKilometres(500, List.of(88_000))).isEqualTo(88_000);
    }

    @Test
    void currentDistanceIsNullWhenNothingHasBeenRecorded() {
        assertThat(WarrantyStatusResolver.currentKilometres(null, List.of())).isNull();
        assertThat(WarrantyStatusResolver.currentKilometres(null, null)).isNull();
    }
}
