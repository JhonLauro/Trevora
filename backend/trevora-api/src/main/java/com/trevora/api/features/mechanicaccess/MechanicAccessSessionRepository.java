package com.trevora.api.features.mechanicaccess;

import com.trevora.api.features.mechanicaccess.MechanicAccessSession;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MechanicAccessSessionRepository extends JpaRepository<MechanicAccessSession, UUID> {
    Optional<MechanicAccessSession> findByMechanicAccessRequestId(UUID mechanicAccessRequestId);

    Optional<MechanicAccessSession> findBySessionToken(String sessionToken);
}
