package com.trevora.api.features.concern;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConcernRepository extends JpaRepository<Concern, UUID> {
    /** Every concern on one vehicle, newest first. Owner-scoped, like every read here. */
    List<Concern> findByVehicleIdAndOwnerIdOrderByCreatedAtDesc(UUID vehicleId, UUID ownerId);

    /**
     * Open concerns only, newest first.
     *
     * <p>The mechanic view's only query. Resolved concerns are never shown to a
     * mechanic: a fixed problem read as a live one wastes the few minutes the
     * session lasts.
     */
    List<Concern> findByVehicleIdAndResolvedAtIsNullOrderByCreatedAtDesc(UUID vehicleId);

    long countByVehicleIdAndOwnerIdAndResolvedAtIsNull(UUID vehicleId, UUID ownerId);

    Optional<Concern> findByConcernIdAndOwnerId(UUID concernId, UUID ownerId);
}
