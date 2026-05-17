package com.trevora.api.repository;

import com.trevora.api.model.QRAccessRequest;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QRAccessRepository extends JpaRepository<QRAccessRequest, UUID> {
    Optional<QRAccessRequest> findByAccessToken(String accessToken);

    List<QRAccessRequest> findByVehicleIdAndOwnerIdOrderByCreatedAtDesc(UUID vehicleId, UUID ownerId);
}
