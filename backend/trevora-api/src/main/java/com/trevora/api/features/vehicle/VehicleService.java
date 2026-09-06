package com.trevora.api.features.vehicle;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.mechanicaccess.MechanicAccessSessionRepository;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.sharing.MechanicAccessRepository;
import com.trevora.api.features.sharing.QRAccessRepository;
import org.springframework.transaction.annotation.Transactional;
import com.trevora.api.features.vehicle.CreateVehicleRequest;
import com.trevora.api.shared.exception.InvalidVehicleUpdateException;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import com.trevora.api.shared.exception.UnauthorizedVehicleAccessException;
import com.trevora.api.features.vehicle.VehicleProfile;
import com.trevora.api.features.vehicle.VehicleRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
        vehicle.setWarrantyStartDate(request.warrantyStartDate());
        vehicle.setWarrantyMonths(request.warrantyMonths());
        vehicle.setWarrantyKmLimit(request.warrantyKmLimit());

        return vehicleRepository.save(vehicle);
    }

    /**
     * A vehicle as its owner's screens read it, warranty and current distance
     * worked out.
     *
     * <p>Here rather than in the controller because it is two facts combined
     * under a rule — the highest reading across the typed value and the
     * records — and that rule is business logic wherever it is written.
     */
    public VehicleResponse describe(VehicleProfile vehicle) {
        Integer fromRecords = serviceRecordRepository
                .findMaxOdometer(vehicle.getVehicleId(), vehicle.getOwnerId());
        return VehicleResponse.from(
                vehicle,
                WarrantyStatusResolver.currentKilometres(
                        vehicle.getOdometer(), fromRecords == null ? List.of() : List.of(fromRecords)));
    }

    /**
     * The same for a whole garage, without a query per card.
     *
     * <p>The list endpoint used to be a straight map over entities. Adding a
     * per-vehicle lookup to it would have made the garage do one round trip
     * per vehicle to draw a page that already loads everything else in one.
     */
    public List<VehicleResponse> describeAll(List<VehicleProfile> vehicles) {
        if (vehicles.isEmpty()) {
            return List.of();
        }
        Map<UUID, Integer> highestByVehicle = new HashMap<>();
        for (Object[] row : serviceRecordRepository
                .findMaxOdometerByVehicleForOwner(vehicles.get(0).getOwnerId())) {
            highestByVehicle.put((UUID) row[0], (Integer) row[1]);
        }
        return vehicles.stream()
                .map(vehicle -> {
                    Integer fromRecords = highestByVehicle.get(vehicle.getVehicleId());
                    return VehicleResponse.from(
                            vehicle,
                            WarrantyStatusResolver.currentKilometres(
                                    vehicle.getOdometer(),
                                    fromRecords == null ? List.of() : List.of(fromRecords)));
                })
                .toList();
    }

    /**
     * Applies only the fields the caller actually sent.
     *
     * <p><b>This exists because a whole-vehicle PUT made every partial editor a
     * thing that could destroy the fields it did not show.</b> The vehicle page
     * has two of them — a details dialog with four registration fields and a
     * warranty dialog with three terms — and under PUT each had to remember to
     * hand back everything the other owned. It worked by convention, and the
     * failure mode was silent: the save succeeds, the screen looks right, and a
     * column is null. The next person to add a column would have inherited that
     * trap without being told it existed.
     *
     * <p>Here a field that was not mentioned is not touched, which is a property
     * of the endpoint rather than a habit callers have to keep.
     *
     * <p>Sending {@code null} is a real instruction, not an omission — it
     * clears the field. That distinction is the whole reason
     * {@link PatchVehicleRequest} tracks which keys arrived; see its notes for
     * why neither a record nor {@code Optional} could express it.
     */
    public VehicleProfile patchVehicleForCurrentUser(UUID vehicleId, PatchVehicleRequest request) {
        requireVehicleOwner();
        VehicleProfile vehicle = getVehicleForCurrentUser(vehicleId);

        /* An empty body is refused rather than treated as a no-op save. It is
           always a caller bug -- a payload built from the wrong variable, or a
           field name that does not match -- and answering 200 to it would hide
           that behind a screen that simply never changes. */
        if (request.isEmpty()) {
            throw new InvalidVehicleUpdateException("The request named no field to change.");
        }

        if (request.has("make")) {
            vehicle.setMake(required(request.getMake(), "Make"));
        }
        if (request.has("model")) {
            vehicle.setModel(required(request.getModel(), "Model"));
        }
        if (request.has("bodyType")) {
            vehicle.setBodyType(blankToNull(request.getBodyType()));
        }
        if (request.has("nickname")) {
            vehicle.setNickname(blankToNull(request.getNickname()));
        }
        if (request.has("plateNumber")) {
            vehicle.setPlateNumber(blankToNull(request.getPlateNumber()));
        }
        if (request.has("vinChassisNumber")) {
            vehicle.setVinChassisNumber(blankToNull(request.getVinChassisNumber()));
        }
        if (request.has("year")) {
            vehicle.setYear(request.getYear());
        }
        if (request.has("odometer")) {
            vehicle.setOdometer(request.getOdometer());
        }
        if (request.has("warrantyStartDate")) {
            vehicle.setWarrantyStartDate(request.getWarrantyStartDate());
        }
        if (request.has("warrantyMonths")) {
            vehicle.setWarrantyMonths(request.getWarrantyMonths());
        }
        if (request.has("warrantyKmLimit")) {
            vehicle.setWarrantyKmLimit(request.getWarrantyKmLimit());
        }

        /* The photo is one fact in two columns: a path without its bucket
           cannot be read back, and a bucket without a path points at nothing.
           PATCH is the first thing able to send half of it, so the pair is
           required whole -- refusing is better than guessing which half the
           caller meant to keep. */
        boolean hasBucket = request.has("photoBucket");
        boolean hasPath = request.has("photoPath");
        if (hasBucket != hasPath) {
            throw new InvalidVehicleUpdateException(
                    "A photo change must send both photoBucket and photoPath.");
        }
        if (hasBucket) {
            vehicle.setPhoto(blankToNull(request.getPhotoBucket()), blankToNull(request.getPhotoPath()));
        }

        return vehicleRepository.save(vehicle);
    }

    /**
     * A value for a column that cannot be null.
     *
     * <p>Only reached when the caller actually sent the field, so this is
     * rejecting an explicit attempt to clear it rather than complaining about
     * an absent one.
     */
    private String required(String value, String label) {
        String trimmed = blankToNull(value);
        if (trimmed == null) {
            throw new InvalidVehicleUpdateException(label + " cannot be removed from a vehicle.");
        }
        return trimmed;
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
