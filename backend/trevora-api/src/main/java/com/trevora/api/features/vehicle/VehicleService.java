package com.trevora.api.features.vehicle;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.vehicle.CreateVehicleRequest;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import com.trevora.api.shared.exception.UnauthorizedVehicleAccessException;
import com.trevora.api.features.vehicle.VehicleProfile;
import com.trevora.api.features.vehicle.VehicleRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class VehicleService {
    public static final UUID MOCK_OWNER_ID = CurrentUserService.MOCK_OWNER_ID;

    private final VehicleRepository vehicleRepository;
    private final CurrentUserService currentUserService;

    public VehicleService(VehicleRepository vehicleRepository, CurrentUserService currentUserService) {
        this.vehicleRepository = vehicleRepository;
        this.currentUserService = currentUserService;
    }

    public List<VehicleProfile> getVehiclesForMockOwner() {
        return getVehiclesForCurrentUser();
    }

    public VehicleProfile createVehicleForMockOwner(CreateVehicleRequest request) {
        return createVehicleForCurrentUser(request);
    }

    public VehicleProfile getVehicleForMockOwner(UUID vehicleId) {
        return getVehicleForCurrentUser(vehicleId);
    }

    public VehicleProfile updateVehicleForMockOwner(UUID vehicleId, UpdateVehicleRequest request) {
        return updateVehicleForCurrentUser(vehicleId, request);
    }

    public VehicleProfile verifyVehicleBelongsToMockOwner(UUID vehicleId) {
        return verifyVehicleBelongsToCurrentUser(vehicleId);
    }

    public List<VehicleProfile> getVehiclesForCurrentUser() {
        requireVehicleOwner();
        return vehicleRepository.findByOwnerIdOrderByCreatedAtDesc(currentUserService.getCurrentUserId());
    }

    public VehicleProfile createVehicleForCurrentUser(CreateVehicleRequest request) {
        requireVehicleOwner();
        VehicleProfile vehicle = new VehicleProfile();
        vehicle.setOwnerId(currentUserService.getCurrentUserId());
        vehicle.setMake(request.make().trim());
        vehicle.setModel(request.model().trim());
        vehicle.setYear(request.year());
        vehicle.setNickname(blankToNull(request.nickname()));
        vehicle.setPlateNumber(blankToNull(request.plateNumber()));
        vehicle.setVinChassisNumber(blankToNull(request.vinChassisNumber()));
        vehicle.setOdometer(request.odometer());

        return vehicleRepository.save(vehicle);
    }

    public VehicleProfile updateVehicleForCurrentUser(UUID vehicleId, UpdateVehicleRequest request) {
        requireVehicleOwner();
        VehicleProfile vehicle = getVehicleForCurrentUser(vehicleId);
        vehicle.setMake(request.make().trim());
        vehicle.setModel(request.model().trim());
        vehicle.setYear(request.year());
        vehicle.setNickname(blankToNull(request.nickname()));
        vehicle.setPlateNumber(blankToNull(request.plateNumber()));
        vehicle.setVinChassisNumber(blankToNull(request.vinChassisNumber()));
        vehicle.setOdometer(request.odometer());
        return vehicleRepository.save(vehicle);
    }

    public VehicleProfile getVehicleForCurrentUser(UUID vehicleId) {
        requireVehicleOwner();
        return vehicleRepository.findByVehicleIdAndOwnerId(vehicleId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Vehicle profile was not found."));
    }

    public VehicleProfile verifyVehicleBelongsToCurrentUser(UUID vehicleId) {
        requireVehicleOwner();
        UUID currentUserId = currentUserService.getCurrentUserId();
        return vehicleRepository.findById(vehicleId)
                .map(vehicle -> {
                    if (!currentUserId.equals(vehicle.getOwnerId())) {
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

    private void requireVehicleOwner() {
        currentUserService.requireVehicleOwner();
    }
}
