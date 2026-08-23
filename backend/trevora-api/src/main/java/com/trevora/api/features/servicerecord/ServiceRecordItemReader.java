package com.trevora.api.features.servicerecord;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * The one way to load a confirmed record's services.
 *
 * <p>It exists so {@link ServiceRecordItem#getLineEntries()} is never silently
 * empty. The app runs with {@code spring.jpa.open-in-view=false}, so the
 * receipt lines cannot be a lazy JPA relation — something has to populate them,
 * and five separate services were each loading items straight from the
 * repository. Whichever of them forgot would have rendered a record as having
 * no receipt lines at all, which is indistinguishable from a record that
 * genuinely has none.
 *
 * <p>Read paths use this. {@link ServiceRecordItemRepository} stays for writes.
 */
@Service
public class ServiceRecordItemReader {
    private final ServiceRecordItemRepository serviceRecordItemRepository;
    private final ServiceRecordLineEntryRepository serviceRecordLineEntryRepository;

    public ServiceRecordItemReader(
            ServiceRecordItemRepository serviceRecordItemRepository,
            ServiceRecordLineEntryRepository serviceRecordLineEntryRepository
    ) {
        this.serviceRecordItemRepository = serviceRecordItemRepository;
        this.serviceRecordLineEntryRepository = serviceRecordLineEntryRepository;
    }

    /** One record's services, in sort order, each with its receipt lines. */
    public List<ServiceRecordItem> forRecord(UUID recordId) {
        return hydrate(serviceRecordItemRepository.findByRecordIdOrderBySortOrder(recordId));
    }

    /**
     * Services for several records at once, keyed by record. Two queries total
     * rather than two per record, which matters on the history list.
     */
    public Map<UUID, List<ServiceRecordItem>> forRecords(Collection<UUID> recordIds) {
        if (recordIds.isEmpty()) {
            return Map.of();
        }
        List<ServiceRecordItem> items = hydrate(
                serviceRecordItemRepository.findByRecordIdInOrderByRecordIdAscSortOrderAsc(recordIds)
        );
        return items.stream().collect(Collectors.groupingBy(ServiceRecordItem::getRecordId));
    }

    private List<ServiceRecordItem> hydrate(List<ServiceRecordItem> items) {
        if (items.isEmpty()) {
            return items;
        }
        Map<UUID, List<ServiceRecordLineEntry>> byItem = serviceRecordLineEntryRepository
                .findByItemIdInOrderByItemIdAscSortOrderAsc(items.stream().map(ServiceRecordItem::getItemId).toList())
                .stream()
                .collect(Collectors.groupingBy(ServiceRecordLineEntry::getItemId));
        items.forEach(item -> item.setLineEntries(byItem.getOrDefault(item.getItemId(), List.of())));
        return items;
    }
}
