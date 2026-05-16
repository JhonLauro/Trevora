package com.trevora.api.service;

import com.trevora.api.dto.CreateVehicleRequest;
import com.trevora.api.exception.ResourceNotFoundException;
import com.trevora.api.exception.UnauthorizedVehicleAccessException;
import com.trevora.api.model.VehicleProfile;
import com.trevora.api.repository.VehicleRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class VehicleService {
    public static final UUID MOCK_OWNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private final VehicleRepository vehicleRepository;

    public VehicleService(VehicleRepository vehicleRepository) {
        this.vehicleRepository = vehicleRepository;
    }

    public List<VehicleProfile> getVehiclesForMockOwner() {
        return vehicleRepository.findByOwnerIdOrderByCreatedAtDesc(MOCK_OWNER_ID);
    }

    public VehicleProfile createVehicleForMockOwner(CreateVehicleRequest request) {
        VehicleProfile vehicle = new VehicleProfile();
        vehicle.setOwnerId(MOCK_OWNER_ID);
        vehicle.setMake(request.make().trim());
        vehicle.setModel(request.model().trim());
        vehicle.setYear(request.year());
        vehicle.setNickname(blankToNull(request.nickname()));
        vehicle.setPlateNumber(blankToNull(request.plateNumber()));
        vehicle.setVinChassisNumber(blankToNull(request.vinChassisNumber()));
        vehicle.setOdometer(request.odometer());

        return vehicleRepository.save(vehicle);
    }

    public VehicleProfile getVehicleForMockOwner(UUID vehicleId) {
        return vehicleRepository.findByVehicleIdAndOwnerId(vehicleId, MOCK_OWNER_ID)
                .orElseThrow(() -> new ResourceNotFoundException("Vehicle profile was not found."));
    }

    public VehicleProfile verifyVehicleBelongsToMockOwner(UUID vehicleId) {
        return vehicleRepository.findById(vehicleId)
                .map(vehicle -> {
                    if (!MOCK_OWNER_ID.equals(vehicle.getOwnerId())) {
                        throw new UnauthorizedVehicleAccessException("Vehicle does not belong to the current owner.");
                    }
                    return vehicle;
                })
                .orElseThrow(() -> new ResourceNotFoundException("Vehicle profile was not found."));
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
