package com.trevora.api.features.vehicle;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

public record CreateVehicleRequest(
        @NotBlank String make,
        @NotBlank String model,
        @Pattern(
                regexp = "sedan|hatchback|suv|mpv|pickup|van|scooter|underbone|motorcycle",
                message = "Body type must be one of: sedan, hatchback, suv, mpv, pickup, van, scooter, underbone, motorcycle"
        )
        String bodyType,
        @Min(1886) Integer year,
        String nickname,
        String plateNumber,
        String vinChassisNumber,
        @Min(0) Integer odometer,
        /* Where the frontend put the photo it uploaded, or null. The file goes
           to Supabase Storage from the browser, exactly as receipts and
           profile photos do; only the pointer is sent here. */
        String photoBucket,
        String photoPath,
        /* Manufacturer warranty terms, all three optional and independently so.
           An owner who knows the booklet says "3 years or 100,000 km" but not
           the delivery date must be able to save the half they have; see
           VehicleProfile for why a partial answer is kept partial.

           @PastOrPresent rather than a database check: current_date is STABLE,
           and Postgres refuses a non-immutable function inside a CHECK
           constraint outright. Here the rule can also name the field and say
           something the owner can act on. */
        @PastOrPresent(message = "A purchase or delivery date cannot be in the future.")
        LocalDate warrantyStartDate,
        @Min(value = 1, message = "Enter the coverage period in months, or leave it blank.")
        @Max(value = 600, message = "That looks like days rather than months — enter the coverage period in months.")
        Integer warrantyMonths,
        @Min(value = 1, message = "Enter the mileage limit in kilometres, or leave it blank.")
        @Max(value = 2000000, message = "That mileage limit looks like a typo. Enter it in kilometres.")
        Integer warrantyKmLimit
) {
}
