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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
        return vehicleService.getVehiclesForCurrentUser().stream()
                .map(VehicleResponse::from)
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public VehicleResponse createVehicle(@Valid @RequestBody CreateVehicleRequest request) {
        return VehicleResponse.from(vehicleService.createVehicleForCurrentUser(request));
    }

    @GetMapping("/{vehicleId}")
    public VehicleResponse getVehicle(@PathVariable UUID vehicleId) {
        return VehicleResponse.from(vehicleService.getVehicleForCurrentUser(vehicleId));
    }

    @PutMapping("/{vehicleId}")
    public VehicleResponse updateVehicle(@PathVariable UUID vehicleId, @Valid @RequestBody UpdateVehicleRequest request) {
        return VehicleResponse.from(vehicleService.updateVehicleForCurrentUser(vehicleId, request));
    }

    @DeleteMapping("/{vehicleId}")
    public ResponseEntity<Void> deleteVehicle(@PathVariable UUID vehicleId) {
        vehicleService.deleteVehicleForCurrentUser(vehicleId);
        return ResponseEntity.noContent().build();
    }
}
