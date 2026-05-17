package com.trevora.api.repository;

import com.trevora.api.model.MechanicAccessSession;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MechanicAccessSessionRepository extends JpaRepository<MechanicAccessSession, UUID> {
    Optional<MechanicAccessSession> findByMechanicAccessRequestId(UUID mechanicAccessRequestId);

    Optional<MechanicAccessSession> findBySessionToken(String sessionToken);
}
