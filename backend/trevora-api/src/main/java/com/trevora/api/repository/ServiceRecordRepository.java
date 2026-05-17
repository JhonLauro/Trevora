package com.trevora.api.repository;

import com.trevora.api.model.ServiceRecord;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceRecordRepository extends JpaRepository<ServiceRecord, UUID> {
    Optional<ServiceRecord> findByDraftIdAndOwnerId(UUID draftId, UUID ownerId);

    List<ServiceRecord> findByVehicleIdAndOwnerId(UUID vehicleId, UUID ownerId, Sort sort);

    Optional<ServiceRecord> findByRecordIdAndVehicleIdAndOwnerId(UUID recordId, UUID vehicleId, UUID ownerId);
}
