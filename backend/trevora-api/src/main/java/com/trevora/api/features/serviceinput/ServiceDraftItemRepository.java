package com.trevora.api.features.serviceinput;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceDraftItemRepository extends JpaRepository<ServiceDraftItem, UUID> {
    List<ServiceDraftItem> findByDraftIdOrderBySortOrder(UUID draftId);

    void deleteByDraftId(UUID draftId);
}
