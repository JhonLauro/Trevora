package com.trevora.api.service;

import com.trevora.api.dto.ServiceHistoryResponse;
import com.trevora.api.dto.ServiceRecordDetailResponse;
import com.trevora.api.dto.ServiceRecordSummaryResponse;
import com.trevora.api.exception.ResourceNotFoundException;
import com.trevora.api.model.ServiceRecord;
import com.trevora.api.repository.ServiceRecordRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

@Service
public class ServiceHistoryService {
    private static final String SORT_OLDEST = "oldest";
    private static final String SORT_LATEST = "latest";

    private final ServiceRecordRepository serviceRecordRepository;
    private final VehicleService vehicleService;
    private final CurrentUserService currentUserService;

    public ServiceHistoryService(
            ServiceRecordRepository serviceRecordRepository,
            VehicleService vehicleService,
            CurrentUserService currentUserService
    ) {
        this.serviceRecordRepository = serviceRecordRepository;
        this.vehicleService = vehicleService;
        this.currentUserService = currentUserService;
    }

    public ServiceHistoryResponse getVehicleHistory(
            UUID vehicleId,
            String sort,
            String serviceType,
            String keyword
    ) {
        currentUserService.requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToMockOwner(vehicleId);

        String normalizedSort = normalizeSort(sort);
        List<ServiceRecord> allRecords = serviceRecordRepository
                .findByVehicleIdAndOwnerId(vehicleId, currentUserService.getCurrentUserId(), repositorySortFor(normalizedSort))
                .stream()
                .toList();
        List<ServiceRecord> records = allRecords
                .stream()
                .filter(record -> matchesServiceType(record, serviceType))
                .filter(record -> matchesKeyword(record, keyword))
                .sorted(comparatorFor(normalizedSort))
                .toList();

        List<ServiceRecordSummaryResponse> summaries = records.stream()
                .map(record -> ServiceRecordSummaryResponse.from(record, categoryFor(record.getServiceType())))
                .toList();
        List<String> serviceTypes = allRecords.stream()
                .map(ServiceRecord::getServiceType)
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
        vehicleService.verifyVehicleBelongsToMockOwner(vehicleId);
        ServiceRecord record = serviceRecordRepository
                .findByRecordIdAndVehicleIdAndOwnerId(recordId, vehicleId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Service record was not found."));

        return ServiceRecordDetailResponse.from(record, categoryFor(record.getServiceType()));
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

    private boolean matchesServiceType(ServiceRecord record, String serviceType) {
        String filter = blankToNull(serviceType);
        if (filter == null) {
            return true;
        }
        return record.getServiceType() != null && record.getServiceType().equalsIgnoreCase(filter);
    }

    private boolean matchesKeyword(ServiceRecord record, String keyword) {
        String filter = blankToNull(keyword);
        if (filter == null) {
            return true;
        }
        String needle = filter.toLowerCase(Locale.ROOT);
        return containsIgnoreCase(record.getServiceType(), needle)
                || containsIgnoreCase(record.getShopName(), needle)
                || containsIgnoreCase(record.getPartsReplaced(), needle)
                || containsIgnoreCase(record.getLaborPerformed(), needle)
                || containsIgnoreCase(record.getRemarks(), needle);
    }

    private boolean containsIgnoreCase(String value, String lowercaseNeedle) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(lowercaseNeedle);
    }

    private String categoryFor(String serviceType) {
        String value = serviceType == null ? "" : serviceType.toLowerCase(Locale.ROOT);
        if (value.contains("oil") || value.contains("filter") || value.contains("tire") || value.contains("tyre")) {
            return "Maintenance";
        }
        if (value.contains("brake") || value.contains("battery") || value.contains("repair") || value.contains("replace")) {
            return "Repair";
        }
        if (value.contains("inspect") || value.contains("diagnostic") || value.contains("check")) {
            return "Inspection";
        }
        return "General";
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
