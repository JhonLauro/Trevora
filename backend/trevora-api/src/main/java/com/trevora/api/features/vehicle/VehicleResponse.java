package com.trevora.api.features.vehicle;

import com.trevora.api.features.vehicle.VehicleProfile;
import java.time.Instant;
import java.util.UUID;

public record VehicleResponse(
        UUID vehicleId,
        UUID ownerId,
        String make,
        String model,
        String bodyType,
        Integer year,
        String nickname,
        String plateNumber,
        String vinChassisNumber,
        Integer odometer,
        String photoBucket,
        String photoPath,
        Instant createdAt
) {
    public static VehicleResponse from(VehicleProfile vehicle) {
        return new VehicleResponse(
                vehicle.getVehicleId(),
                vehicle.getOwnerId(),
                vehicle.getMake(),
                vehicle.getModel(),
                vehicle.getBodyType(),
                vehicle.getYear(),
                vehicle.getNickname(),
                vehicle.getPlateNumber(),
                vehicle.getVinChassisNumber(),
                vehicle.getOdometer(),
                vehicle.getPhotoBucket(),
                vehicle.getPhotoPath(),
                vehicle.getCreatedAt()
        );
    }
}
