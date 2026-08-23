package com.trevora.api.features.servicerecord;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceRecordLineEntryRepository extends JpaRepository<ServiceRecordLineEntry, UUID> {
    List<ServiceRecordLineEntry> findByItemIdOrderBySortOrder(UUID itemId);

    /** One query for a whole record's items, so hydration is not N+1 per item. */
    List<ServiceRecordLineEntry> findByItemIdInOrderByItemIdAscSortOrderAsc(Collection<UUID> itemIds);

    void deleteByItemIdIn(Collection<UUID> itemIds);
}
