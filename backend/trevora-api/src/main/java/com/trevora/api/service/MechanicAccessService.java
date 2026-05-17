package com.trevora.api.service;

import com.trevora.api.dto.MechanicSharedHistoryResponse;
import com.trevora.api.dto.MechanicSharedRecordDetailResponse;
import com.trevora.api.dto.MechanicSharedServiceRecordResponse;
import com.trevora.api.exception.AccessRequestException;
import com.trevora.api.exception.ResourceNotFoundException;
import com.trevora.api.model.MechanicAccessSession;
import com.trevora.api.model.ServiceRecord;
import com.trevora.api.model.VehicleProfile;
import com.trevora.api.repository.MechanicAccessSessionRepository;
import com.trevora.api.repository.ServiceRecordRepository;
import com.trevora.api.repository.VehicleRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MechanicAccessService {
    static final String SESSION_APPROVED = "APPROVED";
    static final String SESSION_EXPIRED = "EXPIRED";
    static final String PERMISSION_READ_ONLY = "READ_ONLY";

    private final MechanicAccessSessionRepository mechanicAccessSessionRepository;
    private final ServiceRecordRepository serviceRecordRepository;
    private final VehicleRepository vehicleRepository;

    public MechanicAccessService(
            MechanicAccessSessionRepository mechanicAccessSessionRepository,
            ServiceRecordRepository serviceRecordRepository,
            VehicleRepository vehicleRepository
    ) {
        this.mechanicAccessSessionRepository = mechanicAccessSessionRepository;
        this.serviceRecordRepository = serviceRecordRepository;
        this.vehicleRepository = vehicleRepository;
    }

    @Transactional
    public MechanicSharedHistoryResponse getSharedHistory(UUID sessionId) {
        MechanicAccessSession session = requireActiveReadOnlySession(sessionId);
        List<ServiceRecord> records = getSessionRecords(session);
        return new MechanicSharedHistoryResponse(
                session.getMechanicAccessSessionId(),
                session.getVehicleId(),
                vehicleLabel(session.getVehicleId()),
                session.getPermission(),
                session.getStatus(),
                session.getApprovedAt(),
                session.getExpiresAt(),
                records.size(),
                records.stream().map(this::toSharedRecord).toList()
        );
    }

    @Transactional
    public MechanicSharedRecordDetailResponse getSharedRecord(UUID sessionId, UUID recordId) {
        MechanicAccessSession session = requireActiveReadOnlySession(sessionId);
        ServiceRecord record = serviceRecordRepository
                .findByRecordIdAndVehicleIdAndOwnerId(recordId, session.getVehicleId(), session.getOwnerId())
                .orElseThrow(() -> new ResourceNotFoundException("Shared service record was not found."));

        return new MechanicSharedRecordDetailResponse(
                session.getMechanicAccessSessionId(),
                session.getVehicleId(),
                vehicleLabel(session.getVehicleId()),
                session.getPermission(),
                session.getExpiresAt(),
                toSharedRecord(record)
        );
    }

    @Transactional
    MechanicAccessSession requireActiveReadOnlySession(UUID sessionId) {
        MechanicAccessSession session = mechanicAccessSessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Mechanic access session was not found."));
        if (!SESSION_APPROVED.equals(session.getStatus())) {
            throw new AccessRequestException("This mechanic access session is not approved.");
        }
        if (!PERMISSION_READ_ONLY.equals(session.getPermission())) {
            throw new AccessRequestException("This mechanic access session is not read-only.");
        }
        if (!session.getExpiresAt().isAfter(Instant.now())) {
            session.setStatus(SESSION_EXPIRED);
            mechanicAccessSessionRepository.save(session);
            throw new AccessRequestException("This mechanic access session has expired.");
        }
        return session;
    }

    List<ServiceRecord> getSessionRecords(MechanicAccessSession session) {
        return serviceRecordRepository
                .findByVehicleIdAndOwnerId(
                        session.getVehicleId(),
                        session.getOwnerId(),
                        Sort.by(Sort.Direction.DESC, "serviceDate").and(Sort.by(Sort.Direction.DESC, "createdAt"))
                )
                .stream()
                .sorted(Comparator.comparing(ServiceRecord::getServiceDate).thenComparing(ServiceRecord::getCreatedAt).reversed())
                .toList();
    }

    MechanicSharedServiceRecordResponse toSharedRecord(ServiceRecord record) {
        return MechanicSharedServiceRecordResponse.from(record, categoryFor(record.getServiceType()));
    }

    String vehicleLabel(UUID vehicleId) {
        return vehicleRepository.findById(vehicleId)
                .map(this::vehicleLabel)
                .orElse("Shared vehicle");
    }

    private String vehicleLabel(VehicleProfile vehicle) {
        if (vehicle.getNickname() != null && !vehicle.getNickname().isBlank()) {
            return vehicle.getNickname();
        }
        StringBuilder label = new StringBuilder();
        if (vehicle.getYear() != null) {
            label.append(vehicle.getYear());
        }
        appendLabelPart(label, vehicle.getMake());
        appendLabelPart(label, vehicle.getModel());
        return label.isEmpty() ? "Shared vehicle" : label.toString();
    }

    private void appendLabelPart(StringBuilder label, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        if (!label.isEmpty()) {
            label.append(' ');
        }
        label.append(value.trim());
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
}
