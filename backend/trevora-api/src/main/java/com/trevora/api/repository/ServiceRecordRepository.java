package com.trevora.api.repository;

import com.trevora.api.model.ServiceRecord;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceRecordRepository extends JpaRepository<ServiceRecord, UUID> {
    Optional<ServiceRecord> findByDraftIdAndOwnerId(UUID draftId, UUID ownerId);
}
