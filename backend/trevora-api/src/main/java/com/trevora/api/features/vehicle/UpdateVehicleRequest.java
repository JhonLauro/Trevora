package com.trevora.api.features.vehicle;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record UpdateVehicleRequest(
        @NotBlank String make,
        @NotBlank String model,
        @Min(1886) Integer year,
        String nickname,
        String plateNumber,
        String vinChassisNumber,
        @Min(0) Integer odometer
) {
}
