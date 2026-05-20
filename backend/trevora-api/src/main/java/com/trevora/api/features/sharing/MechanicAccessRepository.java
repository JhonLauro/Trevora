package com.trevora.api.features.sharing;

import com.trevora.api.features.sharing.MechanicAccessRequest;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MechanicAccessRepository extends JpaRepository<MechanicAccessRequest, UUID> {
    List<MechanicAccessRequest> findByOwnerIdOrderByRequestedAtDesc(UUID ownerId);

    List<MechanicAccessRequest> findByOwnerIdAndStatusOrderByRequestedAtDesc(UUID ownerId, String status);

    Optional<MechanicAccessRequest> findByMechanicAccessRequestIdAndOwnerId(UUID requestId, UUID ownerId);

    Optional<MechanicAccessRequest> findFirstByQrAccessRequestIdOrderByRequestedAtDesc(UUID qrAccessRequestId);

    boolean existsByQrAccessRequestIdAndStatus(UUID qrAccessRequestId, String status);
}
