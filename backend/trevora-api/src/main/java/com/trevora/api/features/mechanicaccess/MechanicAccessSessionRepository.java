package com.trevora.api.features.mechanicaccess;

import com.trevora.api.features.mechanicaccess.MechanicAccessSession;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MechanicAccessSessionRepository extends JpaRepository<MechanicAccessSession, UUID> {
    Optional<MechanicAccessSession> findByMechanicAccessRequestId(UUID mechanicAccessRequestId);

    Optional<MechanicAccessSession> findByMechanicAccessSessionIdAndOwnerId(UUID mechanicAccessSessionId, UUID ownerId);

    List<MechanicAccessSession> findByOwnerIdOrderByApprovedAtDesc(UUID ownerId);

    List<MechanicAccessSession> findByOwnerIdAndStatusOrderByApprovedAtDesc(UUID ownerId, String status);

    Optional<MechanicAccessSession> findBySessionToken(String sessionToken);
}
