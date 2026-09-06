package com.trevora.api.features.history;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.vehicle.VehicleProfile;
import com.trevora.api.features.vehicle.VehicleResponse;
import com.trevora.api.features.vehicle.WarrantyStatusResolver;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.features.history.ServiceHistoryResponse;
import com.trevora.api.features.history.ServiceRecordDetailResponse;
import com.trevora.api.features.history.ServiceRecordSummaryResponse;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ValidationStatus;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import com.trevora.api.features.servicerecord.ServiceRecordItemReader;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ServiceHistoryService {
    private static final String SORT_OLDEST = "oldest";
    private static final String SORT_LATEST = "latest";

    private final ServiceRecordRepository serviceRecordRepository;
    private final ServiceRecordItemReader serviceRecordItemReader;
    private final VehicleService vehicleService;
    private final CurrentUserService currentUserService;

    public ServiceHistoryService(
            ServiceRecordRepository serviceRecordRepository,
            ServiceRecordItemReader serviceRecordItemReader,
            VehicleService vehicleService,
            CurrentUserService currentUserService
    ) {
        this.serviceRecordRepository = serviceRecordRepository;
        this.serviceRecordItemReader = serviceRecordItemReader;
        this.vehicleService = vehicleService;
        this.currentUserService = currentUserService;
    }

    /**
     * The whole garage in one call: the owner's vehicles, and every confirmed
     * record grouped under the vehicle it belongs to.
     *
     * <p>Four queries regardless of how many cars there are -- vehicles,
     * records, items, line entries -- against one request per vehicle before.
     * Ownership is enforced by the queries themselves: both are filtered by the
     * current owner id, so a vehicle that is not theirs cannot appear and
     * neither can its records.
     */
    @Transactional(readOnly = true)
    public GarageSummaryResponse getGarageSummary() {
        currentUserService.requireVehicleOwner();
        UUID ownerId = currentUserService.getCurrentUserId();

        List<VehicleProfile> vehicles = vehicleService.getVehiclesForCurrentUser();
        List<ServiceRecord> records = serviceRecordRepository
                .findByOwnerId(ownerId, repositorySortFor(SORT_LATEST));

        Map<UUID, List<ServiceRecordItem>> itemsByRecord = serviceRecordItemReader
                .forRecords(records.stream().map(ServiceRecord::getRecordId).toList());

        Map<UUID, List<ServiceRecordSummaryResponse>> byVehicle = new LinkedHashMap<>();
        for (VehicleProfile vehicle : vehicles) {
            byVehicle.put(vehicle.getVehicleId(), new java.util.ArrayList<>());
        }
        for (ServiceRecord record : records) {
            List<ServiceRecordSummaryResponse> bucket = byVehicle.get(record.getVehicleId());
            // A record whose vehicle is not in the list cannot belong to this
            // owner; the queries already guarantee that, and this is the belt.
            if (bucket == null) {
                continue;
            }
            bucket.add(ServiceRecordSummaryResponse.from(
                    record, itemsByRecord.getOrDefault(record.getRecordId(), List.of())));
        }

        /* Current distance and warranty are derived per vehicle from the same
           records this method already loaded — no second query, and no second
           rule. The garage, the vehicle page and a mechanic's shared view all
           reach the figure the same way; the odometer tile disagreeing with
           everything else is exactly what this replaced. */
        Map<UUID, List<Integer>> odometersByVehicle = new LinkedHashMap<>();
        for (ServiceRecord record : records) {
            odometersByVehicle
                    .computeIfAbsent(record.getVehicleId(), key -> new java.util.ArrayList<>())
                    .add(record.getOdometer());
        }

        return new GarageSummaryResponse(
                vehicles.stream()
                        .map(vehicle -> VehicleResponse.from(
                                vehicle,
                                WarrantyStatusResolver.currentKilometres(
                                        vehicle.getOdometer(),
                                        odometersByVehicle.getOrDefault(vehicle.getVehicleId(), List.of()))))
                        .toList(),
                byVehicle.entrySet().stream()
                        .map(entry -> new GarageSummaryResponse.VehicleRecords(entry.getKey(), entry.getValue()))
                        .toList()
        );
    }

    public ServiceHistoryResponse getVehicleHistory(
            UUID vehicleId,
            String sort,
            String serviceType,
            String keyword
    ) {
        currentUserService.requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId);

        String normalizedSort = normalizeSort(sort);
        List<ServiceRecord> allRecords = serviceRecordRepository
                .findByVehicleIdAndOwnerId(vehicleId, currentUserService.getCurrentUserId(), repositorySortFor(normalizedSort))
                .stream()
                .toList();

        Map<UUID, List<ServiceRecordItem>> loaded = serviceRecordItemReader
                .forRecords(allRecords.stream().map(ServiceRecord::getRecordId).toList());
        Map<UUID, List<ServiceRecordItem>> itemsByRecord = new LinkedHashMap<>();
        for (ServiceRecord record : allRecords) {
            itemsByRecord.put(record.getRecordId(), loaded.getOrDefault(record.getRecordId(), List.of()));
        }

        List<ServiceRecord> records = allRecords
                .stream()
                .filter(record -> matchesServiceType(itemsByRecord.get(record.getRecordId()), serviceType))
                .filter(record -> matchesKeyword(record, itemsByRecord.get(record.getRecordId()), keyword))
                .sorted(comparatorFor(normalizedSort))
                .toList();

        List<ServiceRecordSummaryResponse> summaries = records.stream()
                .map(record -> ServiceRecordSummaryResponse.from(record, itemsByRecord.get(record.getRecordId())))
                .toList();
        List<String> serviceTypes = itemsByRecord.values().stream()
                .flatMap(List::stream)
                .map(ServiceRecordItem::getServiceType)
                .filter(value -> value != null && !value.isBlank())
                .distinct()
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();

        return new ServiceHistoryResponse(
                vehicleId,
                normalizedSort,
                blankToNull(serviceType),
                blankToNull(keyword),
                summaries.size(),
                serviceTypes,
                summaries
        );
    }

    public ServiceRecordDetailResponse getVehicleHistoryRecord(UUID vehicleId, UUID recordId) {
        currentUserService.requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId);
        ServiceRecord record = serviceRecordRepository
                .findByRecordIdAndVehicleIdAndOwnerId(recordId, vehicleId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Service record was not found."));

        List<ServiceRecordItem> items = serviceRecordItemReader.forRecord(record.getRecordId());
        return ServiceRecordDetailResponse.from(record, items);
    }

    /**
     * Removes one confirmed service record.
     *
     * `service_record_items` cascades at the database level, so only the
     * record itself is deleted here. The originating `service_draft` is left
     * alone: it is the provenance of the entry, not part of it, and dropping
     * it would erase how the record was captured as well as the record.
     *
     * A hard delete, deliberately — the alternative is a hidden row that
     * still counts in nothing and shows in nothing. But the history is the
     * product, so the caller has to confirm first.
     */
    @Transactional
    public void deleteVehicleHistoryRecord(UUID vehicleId, UUID recordId) {
        currentUserService.requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId);
        ServiceRecord record = serviceRecordRepository
                .findByRecordIdAndVehicleIdAndOwnerId(recordId, vehicleId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Service record was not found."));

        serviceRecordRepository.delete(record);
    }

    /**
     * The owner states they have checked this record's fields.
     *
     * Needed because every record predating the column backfilled to
     * NEEDS_REVIEW, and without a way to clear it the attention strip cries
     * wolf forever — which trains people to ignore it, destroying the value
     * of the flag entirely.
     *
     * Deliberately one-way. There is no "un-review": once someone has looked,
     * that happened, and letting it be taken back would make the field a
     * preference rather than a record of events.
     */
    @Transactional
    public ServiceRecordDetailResponse markRecordReviewed(UUID vehicleId, UUID recordId) {
        currentUserService.requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId);
        ServiceRecord record = serviceRecordRepository
                .findByRecordIdAndVehicleIdAndOwnerId(recordId, vehicleId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Service record was not found."));

        record.setValidationStatus(ValidationStatus.VALIDATED);
        ServiceRecord saved = serviceRecordRepository.save(record);
        List<ServiceRecordItem> items = serviceRecordItemReader.forRecord(saved.getRecordId());
        return ServiceRecordDetailResponse.from(saved, items);
    }

    private Sort repositorySortFor(String sort) {
        Sort.Direction direction = SORT_OLDEST.equals(sort) ? Sort.Direction.ASC : Sort.Direction.DESC;
        return Sort.by(direction, "serviceDate").and(Sort.by(direction, "createdAt"));
    }

    private Comparator<ServiceRecord> comparatorFor(String sort) {
        Comparator<ServiceRecord> comparator = Comparator
                .comparing(ServiceRecord::getServiceDate)
                .thenComparing(ServiceRecord::getCreatedAt);
        return SORT_OLDEST.equals(sort) ? comparator : comparator.reversed();
    }

    private String normalizeSort(String sort) {
        if (SORT_OLDEST.equalsIgnoreCase(blankToNull(sort))) {
            return SORT_OLDEST;
        }
        return SORT_LATEST;
    }

    private boolean matchesServiceType(List<ServiceRecordItem> items, String serviceType) {
        String filter = blankToNull(serviceType);
        if (filter == null) {
            return true;
        }
        return items != null && items.stream()
                .anyMatch(item -> item.getServiceType() != null && item.getServiceType().equalsIgnoreCase(filter));
    }

    private boolean matchesKeyword(ServiceRecord record, List<ServiceRecordItem> items, String keyword) {
        String filter = blankToNull(keyword);
        if (filter == null) {
            return true;
        }
        String needle = filter.toLowerCase(Locale.ROOT);
        if (containsIgnoreCase(record.getShopName(), needle) || containsIgnoreCase(record.getRemarks(), needle)) {
            return true;
        }
        return items != null && items.stream().anyMatch(item ->
                containsIgnoreCase(item.getServiceType(), needle)
                        || containsIgnoreCase(item.getPartsReplaced(), needle)
                        || containsIgnoreCase(item.getLaborPerformed(), needle)
        );
    }

    private boolean containsIgnoreCase(String value, String lowercaseNeedle) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(lowercaseNeedle);
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
