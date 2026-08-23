package com.trevora.api.features.servicerecord;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceRecordItemRepository extends JpaRepository<ServiceRecordItem, UUID> {
    List<ServiceRecordItem> findByRecordIdOrderBySortOrder(UUID recordId);

    List<ServiceRecordItem> findByRecordIdInOrderByRecordIdAscSortOrderAsc(Collection<UUID> recordIds);

    void deleteByRecordId(UUID recordId);
}
