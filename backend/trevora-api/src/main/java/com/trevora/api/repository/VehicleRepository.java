package com.trevora.api.repository;

import com.trevora.api.model.VehicleProfile;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VehicleRepository extends JpaRepository<VehicleProfile, UUID> {
    List<VehicleProfile> findByOwnerIdOrderByCreatedAtDesc(UUID ownerId);

    Optional<VehicleProfile> findByVehicleIdAndOwnerId(UUID vehicleId, UUID ownerId);
}
