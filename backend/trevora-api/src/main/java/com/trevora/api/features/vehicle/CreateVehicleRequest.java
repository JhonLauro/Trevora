package com.trevora.api.features.vehicle;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

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
        String photoPath
) {
}
