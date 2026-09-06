package com.trevora.api.features.vehicle;

import com.trevora.api.features.vehicle.CreateVehicleRequest;
import com.trevora.api.features.vehicle.VehicleResponse;
import com.trevora.api.features.vehicle.VehicleService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/vehicles")
public class VehicleController {
    private final VehicleService vehicleService;

    public VehicleController(VehicleService vehicleService) {
        this.vehicleService = vehicleService;
    }

    @GetMapping
    public List<VehicleResponse> listVehicles() {
        return vehicleService.describeAll(vehicleService.getVehiclesForCurrentUser());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public VehicleResponse createVehicle(@Valid @RequestBody CreateVehicleRequest request) {
        return vehicleService.describe(vehicleService.createVehicleForCurrentUser(request));
    }

    @GetMapping("/{vehicleId}")
    public VehicleResponse getVehicle(@PathVariable UUID vehicleId) {
        return vehicleService.describe(vehicleService.getVehicleForCurrentUser(vehicleId));
    }

    /**
     * Edits a vehicle. Only the fields present in the body are applied; a field
     * sent as null is cleared, and one left out is untouched.
     *
     * <p>There is no PUT. There was, and it replaced the whole row, which meant
     * every partial editor had to hand back the columns it did not render or
     * they were written as null. Three separate surfaces had each grown their
     * own hand-maintained list of columns to do that, and one of them was
     * silently wiping owners' warranty terms because its list predated the
     * schema. Deleting the endpoint is what stops a fourth being written.
     */
    @PatchMapping("/{vehicleId}")
    public VehicleResponse patchVehicle(
            @PathVariable UUID vehicleId,
            @Valid @RequestBody PatchVehicleRequest request
    ) {
        return vehicleService.describe(vehicleService.patchVehicleForCurrentUser(vehicleId, request));
    }

    @DeleteMapping("/{vehicleId}")
    public ResponseEntity<Void> deleteVehicle(@PathVariable UUID vehicleId) {
        vehicleService.deleteVehicleForCurrentUser(vehicleId);
        return ResponseEntity.noContent().build();
    }
}
