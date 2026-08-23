package com.trevora.api.features.serviceinput;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceDraftLineEntryRepository extends JpaRepository<ServiceDraftLineEntry, UUID> {
    List<ServiceDraftLineEntry> findByItemIdOrderBySortOrder(UUID itemId);

    /** One query for a whole draft's items, so hydration is not N+1 per item. */
    List<ServiceDraftLineEntry> findByItemIdInOrderByItemIdAscSortOrderAsc(Collection<UUID> itemIds);

    void deleteByItemId(UUID itemId);
}
