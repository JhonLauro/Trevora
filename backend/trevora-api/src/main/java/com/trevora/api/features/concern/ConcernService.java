package com.trevora.api.features.concern;

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Owner-written concerns: create, edit, resolve, read.
 *
 * <p>There is no classification step and there never should be. The text goes
 * in as typed and comes out as typed — see {@link Concern} for why. If a future
 * change here starts importing {@code ServiceClassificationService} or any
 * component vocabulary, that is the bug, not a feature.
 */
@Service
public class ConcernService {
    private final ConcernRepository concernRepository;
    private final VehicleService vehicleService;
    private final CurrentUserService currentUserService;

    public ConcernService(
            ConcernRepository concernRepository,
            VehicleService vehicleService,
            CurrentUserService currentUserService
    ) {
        this.concernRepository = concernRepository;
        this.vehicleService = vehicleService;
        this.currentUserService = currentUserService;
    }

    /** Every concern on the vehicle, open and resolved, newest first. */
    @Transactional(readOnly = true)
    public List<Concern> listForVehicle(UUID vehicleId) {
        vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId);
        return concernRepository.findByVehicleIdAndOwnerIdOrderByCreatedAtDesc(
                vehicleId, currentUserService.getCurrentUserId());
    }

    /**
     * Open concerns on a vehicle, for a caller that has already established its
     * own right to see them.
     *
     * <p>Takes no current user, because the mechanic session has none — it is
     * authorised by an owner-approved, expiring session token that the caller
     * has already checked. The scoping is the caller's job and
     * {@code MechanicAccessService} does it before asking.
     */
    @Transactional(readOnly = true)
    public List<Concern> listOpenForVehicle(UUID vehicleId) {
        return concernRepository.findByVehicleIdAndResolvedAtIsNullOrderByCreatedAtDesc(vehicleId);
    }

    @Transactional(readOnly = true)
    public long countOpenForVehicle(UUID vehicleId) {
        vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId);
        return concernRepository.countByVehicleIdAndOwnerIdAndResolvedAtIsNull(
                vehicleId, currentUserService.getCurrentUserId());
    }

    @Transactional
    public Concern create(UUID vehicleId, ConcernRequest request) {
        vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId);

        Concern concern = new Concern();
        concern.setVehicleId(vehicleId);
        concern.setOwnerId(currentUserService.getCurrentUserId());
        concern.setNote(request.note().trim());
        return concernRepository.save(concern);
    }

    /**
     * Rewrites the note.
     *
     * <p>People write "weird sound" at eleven at night and add what kind of
     * sound the next morning. Editing is the normal case here, not a correction
     * of a mistake.
     */
    @Transactional
    public Concern updateNote(UUID concernId, ConcernRequest request) {
        Concern concern = requireOwnConcern(concernId);
        concern.setNote(request.note().trim());
        return concernRepository.save(concern);
    }

    /**
     * Marks a concern resolved, or reopens it.
     *
     * <p>Nothing records what resolved it. The record the owner had just added
     * is the obvious candidate and is deliberately not stored: a link would be a
     * claim about cause, and the owner ticking a box beside a receipt has not
     * made that claim — only that they are no longer worried about it.
     */
    @Transactional
    public Concern setResolved(UUID concernId, boolean resolved) {
        Concern concern = requireOwnConcern(concernId);
        concern.setResolvedAt(resolved ? Instant.now() : null);
        return concernRepository.save(concern);
    }

    @Transactional
    public void delete(UUID concernId) {
        concernRepository.delete(requireOwnConcern(concernId));
    }

    private Concern requireOwnConcern(UUID concernId) {
        Concern concern = concernRepository
                .findByConcernIdAndOwnerId(concernId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Concern was not found."));
        // The owner column is denormalised, so the vehicle is checked too rather
        // than trusted: a vehicle that has changed hands must not leave its old
        // owner holding a key to it.
        vehicleService.verifyVehicleBelongsToCurrentUser(concern.getVehicleId());
        return concern;
    }
}
