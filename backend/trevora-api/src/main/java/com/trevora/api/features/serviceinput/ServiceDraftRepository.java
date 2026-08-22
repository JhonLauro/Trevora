package com.trevora.api.features.serviceinput;

import com.trevora.api.features.serviceinput.ServiceDraft;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceDraftRepository extends JpaRepository<ServiceDraft, UUID> {
    Optional<ServiceDraft> findByDraftIdAndOwnerId(UUID draftId, UUID ownerId);

    /** Draft items cascade at the database level. */
    long deleteByVehicleId(UUID vehicleId);
}
