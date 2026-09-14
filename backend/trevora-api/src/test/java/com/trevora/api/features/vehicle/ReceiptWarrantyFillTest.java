package com.trevora.api.features.vehicle;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * Fill the gaps a receipt can fill; never change a date the owner already has.
 */
class ReceiptWarrantyFillTest {

    private static final LocalDate START = LocalDate.of(2024, 7, 31);
    private static final LocalDate END = LocalDate.of(2026, 7, 31);

    private static VehicleProfile vehicle(LocalDate start, Integer months, LocalDate expiry, String source) {
        VehicleProfile vehicle = new VehicleProfile();
        vehicle.setWarrantyStartDate(start);
        vehicle.setWarrantyMonths(months);
        vehicle.setWarrantyExpiryDate(expiry);
        vehicle.setWarrantySource(source);
        return vehicle;
    }

    @Test
    void fillsBothDatesOnAVehicleWithNone() {
        VehicleProfile vehicle = vehicle(null, null, null, null);

        Optional<ReceiptWarrantyFill.Filled> filled = ReceiptWarrantyFill.apply(vehicle, START, END);

        assertThat(filled).contains(new ReceiptWarrantyFill.Filled(START, END));
        assertThat(vehicle.getWarrantyStartDate()).isEqualTo(START);
        assertThat(vehicle.getWarrantyExpiryDate()).isEqualTo(END);
        assertThat(vehicle.getWarrantySource()).isEqualTo("RECEIPT");
    }

    /** The GLE on 2026-09-15: start typed, period cleared, so no end date. */
    @Test
    void fillsOnlyTheMissingEndDate() {
        VehicleProfile vehicle = vehicle(START, null, null, "OWNER");

        assertThat(ReceiptWarrantyFill.apply(vehicle, START, END))
                .contains(new ReceiptWarrantyFill.Filled(null, END));
        assertThat(vehicle.getWarrantyExpiryDate()).isEqualTo(END);
        assertThat(vehicle.getWarrantySource()).isEqualTo("RECEIPT");
    }

    @Test
    void changesNothingWhenTheVehicleAlreadyAgrees() {
        // 31 Jul 2024 + 24 months is the printed 31 Jul 2026.
        VehicleProfile vehicle = vehicle(START, 24, null, "OWNER");

        assertThat(ReceiptWarrantyFill.apply(vehicle, START, END)).isEmpty();
        assertThat(vehicle.getWarrantyExpiryDate()).isNull();
        assertThat(vehicle.getWarrantySource()).isEqualTo("OWNER");
    }

    /** A disagreement is the owner's choice on the Saved page, never an overwrite. */
    @Test
    void neverOverwritesADateTheOwnerHas() {
        VehicleProfile vehicle = vehicle(LocalDate.of(2024, 8, 1), 24, null, "OWNER");

        assertThat(ReceiptWarrantyFill.apply(vehicle, START, END)).isEmpty();
        assertThat(vehicle.getWarrantyStartDate()).isEqualTo(LocalDate.of(2024, 8, 1));
        assertThat(vehicle.getWarrantyExpiryDate()).isNull();
        assertThat(vehicle.getWarrantySource()).isEqualTo("OWNER");
    }

    @Test
    void refusesAFillThatWouldEndThePeriodBeforeItStarts() {
        VehicleProfile vehicle = vehicle(LocalDate.of(2027, 1, 1), null, null, "OWNER");

        assertThat(ReceiptWarrantyFill.apply(vehicle, null, END)).isEmpty();
        assertThat(vehicle.getWarrantyExpiryDate()).isNull();
    }
}
