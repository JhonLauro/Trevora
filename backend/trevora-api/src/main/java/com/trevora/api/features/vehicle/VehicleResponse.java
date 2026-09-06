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
        /* The reading the owner typed, and only that. Kept so the edit form
           can prefill the field it writes to; `currentOdometer` below is what
           screens display. */
        Integer odometer,
        /**
         * The highest reading known for this vehicle, across the typed value
         * and every service record.
         *
         * Added because the vehicle page's Odometer tile read the typed column
         * alone -- which is null on most vehicles, so the tile said "Not
         * recorded" on cars with a dozen receipts filed against them, while
         * the warranty block underneath it counted kilometres from the
         * records. Two numbers for one question, disagreeing. This is the one
         * both now read.
         */
        Integer currentOdometer,
        String photoBucket,
        String photoPath,
        Instant createdAt,
        /* Never null. A vehicle with no terms recorded gets a NOT_SET block
           rather than an absent one, so no caller has to decide what a missing
           warranty key means. */
        VehicleWarrantyResponse warranty
) {
    public static VehicleResponse from(VehicleProfile vehicle, Integer currentOdometer) {
        WarrantyCoverage coverage = WarrantyStatusResolver.resolve(vehicle, currentOdometer);
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
                currentOdometer,
                vehicle.getPhotoBucket(),
                vehicle.getPhotoPath(),
                vehicle.getCreatedAt(),
                VehicleWarrantyResponse.from(vehicle, coverage)
        );
    }
}
