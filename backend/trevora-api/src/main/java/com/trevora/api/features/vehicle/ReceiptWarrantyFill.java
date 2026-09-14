package com.trevora.api.features.vehicle;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Fills the warranty dates a vehicle is missing from the ones its receipt printed.
 *
 * <p><b>Why automatic, when the plate and VIN wait for a click.</b> A plate on a
 * receipt might belong to another car; a warranty period printed on the dealer's
 * own repair order describes this one, and the owner has nothing to decide about
 * a gap. Asking them to press "Add it" only added a step between the paper and a
 * warranty tab that says "incomplete". Decided by the project owner 2026-09-15,
 * reversing the earlier "nothing writes to the vehicle without a click" for this
 * one case. The Saved page says what was filled.
 *
 * <p><b>Never overwrites.</b> Only a date the vehicle does not have is filled. A
 * date both sides have and disagree on is left exactly as it is, and the Saved
 * page asks the owner which to keep: that is a choice about their own data, not a
 * gap. Nor is anything filled that would leave the period ending before it starts.
 *
 * <p>Runs inside the record's confirmation, so a record that fails to save
 * changes nothing on the vehicle either.
 */
@Service
public class ReceiptWarrantyFill {

    static final String START_KEY = "receiptWarrantyStartDate";
    static final String EXPIRY_KEY = "receiptWarrantyExpiryDate";

    /** What was filled, for the Saved page. A date not filled is null. */
    public record Filled(LocalDate startDate, LocalDate expiryDate) {
    }

    private final VehicleRepository vehicleRepository;

    public ReceiptWarrantyFill(VehicleRepository vehicleRepository) {
        this.vehicleRepository = vehicleRepository;
    }

    /**
     * @param draftMetadata the confirmed draft's field metadata, where extraction
     *     stored the dates the receipt printed
     * @return what was filled, or empty when the receipt printed no warranty dates,
     *     the vehicle already had them, or they disagree
     */
    public Optional<Filled> fillFrom(UUID vehicleId, UUID ownerId, Map<String, Object> draftMetadata) {
        if (draftMetadata == null) {
            return Optional.empty();
        }
        LocalDate start = isoDate(draftMetadata.get(START_KEY));
        LocalDate expiry = isoDate(draftMetadata.get(EXPIRY_KEY));
        if (start == null && expiry == null) {
            return Optional.empty();
        }
        return vehicleRepository.findByVehicleIdAndOwnerId(vehicleId, ownerId)
                .flatMap(vehicle -> {
                    Optional<Filled> filled = apply(vehicle, start, expiry);
                    filled.ifPresent(ignored -> vehicleRepository.save(vehicle));
                    return filled;
                });
    }

    /** The decision, separate from persistence so every case is testable. */
    static Optional<Filled> apply(VehicleProfile vehicle, LocalDate start, LocalDate expiry) {
        LocalDate recordedStart = vehicle.getWarrantyStartDate();
        LocalDate recordedExpiry = vehicle.getWarrantyExpiryDate() != null
                ? vehicle.getWarrantyExpiryDate()
                : (recordedStart != null && vehicle.getWarrantyMonths() != null
                        ? recordedStart.plusMonths(vehicle.getWarrantyMonths())
                        : null);

        boolean startsDisagree = start != null && recordedStart != null && !start.equals(recordedStart);
        boolean expiriesDisagree = expiry != null && recordedExpiry != null && !expiry.equals(recordedExpiry);
        if (startsDisagree || expiriesDisagree) {
            return Optional.empty();
        }

        boolean fillStart = start != null && recordedStart == null;
        boolean fillExpiry = expiry != null && recordedExpiry == null;
        if (!fillStart && !fillExpiry) {
            return Optional.empty();
        }

        LocalDate resultingStart = fillStart ? start : recordedStart;
        LocalDate resultingExpiry = fillExpiry ? expiry : recordedExpiry;
        if (resultingStart != null && resultingExpiry != null && !resultingExpiry.isAfter(resultingStart)) {
            return Optional.empty();
        }

        if (fillStart) {
            vehicle.setWarrantyStartDate(start);
        }
        if (fillExpiry) {
            vehicle.setWarrantyExpiryDate(expiry);
        }
        vehicle.setWarrantySource("RECEIPT");
        return Optional.of(new Filled(fillStart ? start : null, fillExpiry ? expiry : null));
    }

    private static LocalDate isoDate(Object value) {
        if (!(value instanceof String text) || text.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(text.trim());
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }
}
