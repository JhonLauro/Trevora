package com.trevora.api.features.mechanicaccess;

import com.trevora.api.features.mechanicaccess.MechanicSharedHistoryResponse;
import com.trevora.api.features.mechanicaccess.MechanicSharedRecordDetailResponse;
import com.trevora.api.features.mechanicaccess.MechanicSharedServiceRecordResponse;
import com.trevora.api.features.mechanicaccess.OwnerMechanicAccessSessionResponse;
import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.shared.exception.AccessRequestException;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import com.trevora.api.features.mechanicaccess.MechanicAccessSession;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.sharing.MechanicAccessRepository;
import com.trevora.api.features.sharing.MechanicAccessRequest;
import com.trevora.api.features.vehicle.VehicleProfile;
import com.trevora.api.features.mechanicaccess.MechanicAccessSessionRepository;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import com.trevora.api.features.servicerecord.ServiceRecordItemRepository;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.vehicle.VehicleRepository;
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
    static final String SESSION_REVOKED = "REVOKED";
    static final String PERMISSION_READ_ONLY = "READ_ONLY";

    private final MechanicAccessSessionRepository mechanicAccessSessionRepository;
    private final MechanicAccessRepository mechanicAccessRepository;
    private final ServiceDraftRepository serviceDraftRepository;
    private final ServiceRecordRepository serviceRecordRepository;
    private final ServiceRecordItemRepository serviceRecordItemRepository;
    private final VehicleRepository vehicleRepository;
    private final CurrentUserService currentUserService;

    public MechanicAccessService(
            MechanicAccessSessionRepository mechanicAccessSessionRepository,
            MechanicAccessRepository mechanicAccessRepository,
            ServiceDraftRepository serviceDraftRepository,
            ServiceRecordRepository serviceRecordRepository,
            ServiceRecordItemRepository serviceRecordItemRepository,
            VehicleRepository vehicleRepository,
            CurrentUserService currentUserService
    ) {
        this.mechanicAccessSessionRepository = mechanicAccessSessionRepository;
        this.mechanicAccessRepository = mechanicAccessRepository;
        this.serviceDraftRepository = serviceDraftRepository;
        this.serviceRecordRepository = serviceRecordRepository;
        this.serviceRecordItemRepository = serviceRecordItemRepository;
        this.vehicleRepository = vehicleRepository;
        this.currentUserService = currentUserService;
    }

    @Transactional
    public List<OwnerMechanicAccessSessionResponse> getOwnerSessions(String status) {
        currentUserService.requireVehicleOwner();
        UUID ownerId = currentUserService.getCurrentUserId();
        List<MechanicAccessSession> sessions = blankToNull(status) == null
                ? mechanicAccessSessionRepository.findByOwnerIdOrderByApprovedAtDesc(ownerId)
                : mechanicAccessSessionRepository.findByOwnerIdAndStatusOrderByApprovedAtDesc(ownerId, status.trim().toUpperCase(Locale.ROOT));
        return sessions.stream()
                .map(this::expireIfNeeded)
                .map(this::toOwnerSessionResponse)
                .toList();
    }

    @Transactional
    public OwnerMechanicAccessSessionResponse revokeOwnerSession(UUID sessionId) {
        currentUserService.requireVehicleOwner();
        MechanicAccessSession session = mechanicAccessSessionRepository
                .findByMechanicAccessSessionIdAndOwnerId(sessionId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Mechanic access session was not found."));
        session.setStatus(SESSION_REVOKED);
        return toOwnerSessionResponse(mechanicAccessSessionRepository.save(session));
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

    private MechanicAccessSession expireIfNeeded(MechanicAccessSession session) {
        if (SESSION_APPROVED.equals(session.getStatus()) && !session.getExpiresAt().isAfter(Instant.now())) {
            session.setStatus(SESSION_EXPIRED);
            return mechanicAccessSessionRepository.save(session);
        }
        return session;
    }

    private OwnerMechanicAccessSessionResponse toOwnerSessionResponse(MechanicAccessSession session) {
        MechanicAccessRequest request = mechanicAccessRepository
                .findById(session.getMechanicAccessRequestId())
                .orElse(null);
        return OwnerMechanicAccessSessionResponse.from(session, vehicleLabel(session.getVehicleId()), request);
    }

    MechanicSharedServiceRecordResponse toSharedRecord(ServiceRecord record) {
        ServiceDraft sourceDraft = serviceDraftRepository
                .findByDraftIdAndOwnerId(record.getDraftId(), record.getOwnerId())
                .orElse(null);
        List<ServiceRecordItem> items = serviceRecordItemRepository.findByRecordIdOrderBySortOrder(record.getRecordId());
        return MechanicSharedServiceRecordResponse.from(record, items, sourceDraft);
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

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
