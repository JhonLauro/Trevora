package com.trevora.api.features.serviceinput;

import com.trevora.api.features.vehicle.VehicleProfile;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * What the extractor is told about the vehicle a receipt was filed against.
 *
 * <p>Extraction ran on OCR text and nothing else for a long time, which left
 * the model guessing at things the system already knew. {@code CVT} is a
 * transmission on a car and the drive on a scooter, and the same three letters
 * cannot be read correctly without knowing which is in front of you. So a
 * scooter's most common service came back labelled Transmission — the closest
 * word the vocabulary offered — and Transmission is not a component a
 * motorcycle has, so the record attributed to nothing and vanished from the
 * parts map.
 *
 * <p>This is <b>interpretation context, never a source of values</b>. The
 * prompt says so explicitly, and it matters: a make and model handed to a model
 * that is also being asked to read a make and model off a receipt is an
 * invitation to echo the context back as though the paper said it. The receipt
 * remains the only evidence. What the vehicle buys is disambiguation — which
 * meaning of a word, which components exist, whether an odometer reading is
 * plausible, and whether this receipt looks like it belongs to this vehicle
 * at all.
 *
 * @param vehicleClass {@code car} or {@code motorcycle} — the only distinction
 *     the component taxonomy branches on
 */
public record VehicleContext(
        String vehicleClass,
        String bodyType,
        String make,
        String model,
        Integer modelYear,
        Integer lastKnownOdometer,
        String plateNumber
) {
    public static final String CAR = "car";
    public static final String MOTORCYCLE = "motorcycle";

    /**
     * Body types whose vehicle class is motorcycle.
     *
     * <p>Mirrors {@code vehicleClassFor} in the frontend catalogue, and the
     * default is the same and for the same reason: an unknown or missing body
     * type is treated as a car, because every vehicle created before the picker
     * existed is one and the car taxonomy never claims a motorcycle has parts
     * it does not have.
     */
    private static final Set<String> MOTORCYCLE_BODY_TYPES = Set.of("motorcycle", "scooter", "underbone");

    /** The context for an unknown vehicle: enough to be safe, nothing asserted. */
    public static final VehicleContext UNKNOWN =
            new VehicleContext(CAR, null, null, null, null, null, null);

    public static VehicleContext from(VehicleProfile vehicle) {
        if (vehicle == null) {
            return UNKNOWN;
        }
        return new VehicleContext(
                vehicleClassFor(vehicle.getBodyType()),
                vehicle.getBodyType(),
                vehicle.getMake(),
                vehicle.getModel(),
                vehicle.getYear(),
                vehicle.getOdometer(),
                vehicle.getPlateNumber()
        );
    }

    public static String vehicleClassFor(String bodyType) {
        if (bodyType == null) {
            return CAR;
        }
        return MOTORCYCLE_BODY_TYPES.contains(bodyType.trim().toLowerCase(Locale.ROOT)) ? MOTORCYCLE : CAR;
    }

    public boolean isMotorcycle() {
        return MOTORCYCLE.equals(vehicleClass);
    }

    /**
     * The block prepended to the OCR text.
     *
     * <p>Only fields that are actually known are listed. A line reading
     * "Model: null" invites the model to reason about the absence rather than
     * simply not having the information.
     */
    public String toPromptBlock() {
        StringBuilder block = new StringBuilder("Vehicle this receipt was filed against:\n");
        append(block, "Vehicle class", vehicleClass);
        append(block, "Body type", bodyType);
        append(block, "Make", make);
        append(block, "Model", model);
        append(block, "Model year", modelYear);
        append(block, "Odometer at last record", lastKnownOdometer);
        append(block, "Plate number", plateNumber);
        return block.toString();
    }

    private static void append(StringBuilder block, String label, Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return;
        }
        block.append("- ").append(label).append(": ").append(value).append('\n');
    }

    /**
     * The controlled component vocabulary for this vehicle class.
     *
     * <p>Offering a rider the car list is what produced the Transmission
     * problem: the model has to answer from the list it is given, so a list
     * without a drive chain guarantees a wrong answer for the single most
     * common thing in a motorcycle's history.
     */
    public List<String> allowedComponents() {
        return isMotorcycle()
                ? ServiceClassificationService.MOTORCYCLE_COMPONENTS
                : ServiceClassificationService.CAR_COMPONENTS;
    }
}
