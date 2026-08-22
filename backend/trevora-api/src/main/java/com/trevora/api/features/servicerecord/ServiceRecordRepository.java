package com.trevora.api.features.servicerecord;

import com.trevora.api.features.servicerecord.ServiceRecord;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceRecordRepository extends JpaRepository<ServiceRecord, UUID> {
    Optional<ServiceRecord> findByDraftIdAndOwnerId(UUID draftId, UUID ownerId);

    List<ServiceRecord> findByVehicleIdAndOwnerId(UUID vehicleId, UUID ownerId, Sort sort);

    Optional<ServiceRecord> findByRecordIdAndOwnerId(UUID recordId, UUID ownerId);

    Optional<ServiceRecord> findByRecordIdAndVehicleIdAndOwnerId(UUID recordId, UUID vehicleId, UUID ownerId);

    long countByVehicleIdAndOwnerId(UUID vehicleId, UUID ownerId);

    /** Items cascade at the database level; only the records need deleting here. */
    long deleteByVehicleId(UUID vehicleId);
}
