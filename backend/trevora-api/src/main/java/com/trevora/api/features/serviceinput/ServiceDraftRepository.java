package com.trevora.api.features.serviceinput;

import com.trevora.api.features.serviceinput.ServiceDraft;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceDraftRepository extends JpaRepository<ServiceDraft, UUID> {
    Optional<ServiceDraft> findByDraftIdAndOwnerId(UUID draftId, UUID ownerId);

    /** Every draft an owner has, used when deleting their account to find the
     *  receipt images that the database cascade cannot reach. */
    List<ServiceDraft> findByOwnerId(UUID ownerId);

    /** Every unconfirmed draft for one vehicle, used by the duplicate check:
     *  scanning the same receipt twice in a row produces two drafts and no
     *  records at all, which is the case the confirmed-history check misses. */
    List<ServiceDraft> findByVehicleIdAndOwnerId(UUID vehicleId, UUID ownerId);

    /** Draft items cascade at the database level. */
    long deleteByVehicleId(UUID vehicleId);
}
