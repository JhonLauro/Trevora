package com.trevora.api.features.history;

import com.trevora.api.features.vehicle.VehicleResponse;
import java.util.List;
import java.util.UUID;

/**
 * Everything the garage screen needs, in one answer.
 *
 * <p>It used to take one request for the vehicles and then one per vehicle for
 * its history. That is fine on a fast local network and expensive over a real
 * one: every request pays its own authentication and its own round trip, and
 * the count grows with the number of cars.
 *
 * <p>Records arrive already grouped by vehicle, newest first within each group,
 * so the client does no work to assemble them.
 */
public record GarageSummaryResponse(
        List<VehicleResponse> vehicles,
        List<VehicleRecords> records
) {
    public record VehicleRecords(
            UUID vehicleId,
            List<ServiceRecordSummaryResponse> records
    ) {
    }
}
