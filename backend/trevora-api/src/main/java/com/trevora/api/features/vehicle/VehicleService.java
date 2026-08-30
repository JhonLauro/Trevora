package com.trevora.api.features.vehicle;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.mechanicaccess.MechanicAccessSessionRepository;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.sharing.MechanicAccessRepository;
import com.trevora.api.features.sharing.QRAccessRepository;
import org.springframework.transaction.annotation.Transactional;
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
    private final VehicleRepository vehicleRepository;
    private final CurrentUserService currentUserService;
    private final ServiceRecordRepository serviceRecordRepository;
    private final ServiceDraftRepository serviceDraftRepository;
    private final QRAccessRepository qrAccessRepository;
    private final MechanicAccessRepository mechanicAccessRepository;
    private final MechanicAccessSessionRepository mechanicAccessSessionRepository;

    public VehicleService(
            VehicleRepository vehicleRepository,
            CurrentUserService currentUserService,
            ServiceRecordRepository serviceRecordRepository,
            ServiceDraftRepository serviceDraftRepository,
            QRAccessRepository qrAccessRepository,
            MechanicAccessRepository mechanicAccessRepository,
            MechanicAccessSessionRepository mechanicAccessSessionRepository
    ) {
        this.vehicleRepository = vehicleRepository;
        this.currentUserService = currentUserService;
        this.serviceRecordRepository = serviceRecordRepository;
        this.serviceDraftRepository = serviceDraftRepository;
        this.qrAccessRepository = qrAccessRepository;
        this.mechanicAccessRepository = mechanicAccessRepository;
        this.mechanicAccessSessionRepository = mechanicAccessSessionRepository;
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
        vehicle.setBodyType(blankToNull(request.bodyType()));
        vehicle.setYear(request.year());
        vehicle.setNickname(blankToNull(request.nickname()));
        vehicle.setPlateNumber(blankToNull(request.plateNumber()));
        vehicle.setVinChassisNumber(blankToNull(request.vinChassisNumber()));
        vehicle.setOdometer(request.odometer());
        vehicle.setPhoto(blankToNull(request.photoBucket()), blankToNull(request.photoPath()));

        return vehicleRepository.save(vehicle);
    }

    public VehicleProfile updateVehicleForCurrentUser(UUID vehicleId, UpdateVehicleRequest request) {
        requireVehicleOwner();
        VehicleProfile vehicle = getVehicleForCurrentUser(vehicleId);
        vehicle.setMake(request.make().trim());
        vehicle.setModel(request.model().trim());
        vehicle.setBodyType(blankToNull(request.bodyType()));
        vehicle.setYear(request.year());
        vehicle.setNickname(blankToNull(request.nickname()));
        vehicle.setPlateNumber(blankToNull(request.plateNumber()));
        vehicle.setVinChassisNumber(blankToNull(request.vinChassisNumber()));
        vehicle.setOdometer(request.odometer());
        vehicle.setPhoto(blankToNull(request.photoBucket()), blankToNull(request.photoPath()));
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

    /**
     * Deletes a vehicle and everything filed under it.
     *
     * Every child foreign key on vehicle_profiles is NO ACTION, so the rows
     * have to go in dependency order or the delete is rejected. Doing it here
     * rather than switching the constraints to ON DELETE CASCADE keeps the
     * order explicit and reviewable, and stops an unrelated cascade from
     * quietly destroying service history later.
     *
     * Order matters: sessions reference requests, requests reference the QR
     * request, and confirmed records reference the draft they came from.
     *
     * This is a hard delete. The history is the product, so removing a
     * vehicle removes the evidence with it — the UI must say so plainly
     * before calling this.
     */
    @Transactional
    public void deleteVehicleForCurrentUser(UUID vehicleId) {
        requireVehicleOwner();
        VehicleProfile vehicle = getVehicleForCurrentUser(vehicleId);

        mechanicAccessSessionRepository.deleteByVehicleId(vehicleId);
        mechanicAccessRepository.deleteByVehicleId(vehicleId);
        qrAccessRepository.deleteByVehicleId(vehicleId);
        serviceRecordRepository.deleteByVehicleId(vehicleId);
        serviceDraftRepository.deleteByVehicleId(vehicleId);

        vehicleRepository.delete(vehicle);
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
