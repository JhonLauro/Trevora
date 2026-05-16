package com.trevora.api.repository;

import com.trevora.api.model.ServiceDraft;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceDraftRepository extends JpaRepository<ServiceDraft, UUID> {
    Optional<ServiceDraft> findByDraftIdAndOwnerId(UUID draftId, UUID ownerId);
}
