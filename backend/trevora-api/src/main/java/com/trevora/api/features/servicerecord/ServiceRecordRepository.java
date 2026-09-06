package com.trevora.api.features.servicerecord;

import com.trevora.api.features.servicerecord.ServiceRecord;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ServiceRecordRepository extends JpaRepository<ServiceRecord, UUID> {
    Optional<ServiceRecord> findByDraftIdAndOwnerId(UUID draftId, UUID ownerId);

    List<ServiceRecord> findByVehicleIdAndOwnerId(UUID vehicleId, UUID ownerId, Sort sort);

    /** Every confirmed record the owner has, across every vehicle. Backs the
        garage summary, which would otherwise be one request per vehicle. */
    List<ServiceRecord> findByOwnerId(UUID ownerId, Sort sort);

    Optional<ServiceRecord> findByRecordIdAndOwnerId(UUID recordId, UUID ownerId);

    Optional<ServiceRecord> findByRecordIdAndVehicleIdAndOwnerId(UUID recordId, UUID vehicleId, UUID ownerId);

    long countByVehicleIdAndOwnerId(UUID vehicleId, UUID ownerId);

    /**
     * The highest odometer reading filed against one vehicle, or null when no
     * record carries one.
     *
     * <p>The highest rather than the latest, and that is not an optimisation.
     * Receipts are filed out of order — an owner working through a shoebox of
     * old paperwork enters last year's visit after this month's — so ordering
     * by date and taking the first row reports the vehicle travelling
     * backwards. On the warranty screen that means handing back kilometres of
     * cover which have already been used. Same rule, same reason, as
     * OdometerResolver applies within a single document.
     */
    @Query("select max(r.odometer) from ServiceRecord r "
            + "where r.vehicleId = :vehicleId and r.ownerId = :ownerId")
    Integer findMaxOdometer(@Param("vehicleId") UUID vehicleId, @Param("ownerId") UUID ownerId);

    /**
     * The same figure for every vehicle an owner has, in one query.
     *
     * <p>The garage lists every vehicle; one query per card is how a list page
     * quietly becomes N+1. Each row is {@code [vehicleId, maxOdometer]}.
     */
    @Query("select r.vehicleId, max(r.odometer) from ServiceRecord r "
            + "where r.ownerId = :ownerId group by r.vehicleId")
    List<Object[]> findMaxOdometerByVehicleForOwner(@Param("ownerId") UUID ownerId);

    /** Items cascade at the database level; only the records need deleting here. */
    long deleteByVehicleId(UUID vehicleId);
}
