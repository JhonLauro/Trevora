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
import com.trevora.api.features.servicerecord.ServiceRecordItemReader;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.vehicle.VehicleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
    private static final Logger log = LoggerFactory.getLogger(MechanicAccessService.class);

    static final String SESSION_APPROVED = "APPROVED";
    static final String SESSION_EXPIRED = "EXPIRED";
    static final String SESSION_REVOKED = "REVOKED";
    static final String PERMISSION_READ_ONLY = "READ_ONLY";

    private final MechanicAccessSessionRepository mechanicAccessSessionRepository;
    private final MechanicAccessRepository mechanicAccessRepository;
    private final ServiceDraftRepository serviceDraftRepository;
    private final ServiceRecordRepository serviceRecordRepository;
    private final ServiceRecordItemReader serviceRecordItemReader;
    private final VehicleRepository vehicleRepository;
    private final CurrentUserService currentUserService;

    public MechanicAccessService(
            MechanicAccessSessionRepository mechanicAccessSessionRepository,
            MechanicAccessRepository mechanicAccessRepository,
            ServiceDraftRepository serviceDraftRepository,
            ServiceRecordRepository serviceRecordRepository,
            ServiceRecordItemReader serviceRecordItemReader,
            VehicleRepository vehicleRepository,
            CurrentUserService currentUserService
    ) {
        this.mechanicAccessSessionRepository = mechanicAccessSessionRepository;
        this.mechanicAccessRepository = mechanicAccessRepository;
        this.serviceDraftRepository = serviceDraftRepository;
        this.serviceRecordRepository = serviceRecordRepository;
        this.serviceRecordItemReader = serviceRecordItemReader;
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
    public MechanicSharedHistoryResponse getSharedHistory(UUID sessionId, String sessionToken) {
        MechanicAccessSession session = requireActiveReadOnlySession(sessionId, sessionToken);
        List<ServiceRecord> records = getSessionRecords(session);
        return new MechanicSharedHistoryResponse(
                session.getMechanicAccessSessionId(),
                session.getVehicleId(),
                vehicleLabel(session.getVehicleId()),
                vehiclePlateNumber(session.getVehicleId()),
                vehicleBodyType(session.getVehicleId()),
                session.getPermission(),
                session.getStatus(),
                session.getApprovedAt(),
                session.getExpiresAt(),
                records.size(),
                records.stream().map(this::toSharedRecord).toList()
        );
    }

    @Transactional
    public MechanicSharedRecordDetailResponse getSharedRecord(UUID sessionId, UUID recordId, String sessionToken) {
        MechanicAccessSession session = requireActiveReadOnlySession(sessionId, sessionToken);
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

    /**
     * Kept for the owner-side paths, which are already authenticated as the
     * owner and never see a mechanic's token.
     */
    @Transactional
    MechanicAccessSession requireActiveReadOnlySession(UUID sessionId) {
        return requireActiveReadOnlySession(sessionId, null, false);
    }

    /**
     * The mechanic-facing guard: the session id <em>and</em> the token issued
     * with it.
     *
     * <p>Until now the id alone was the whole credential, and it travels in the
     * URL -- so it survives in browser history, in {@code Referer} headers, in
     * logs, and in any screenshot of the page. The token was already being
     * generated, stored, and handed to the mechanic's browser when the owner
     * approved; nothing ever checked it.
     *
     * <p>Now the browser keeps it and sends it as a header, which means a
     * leaked URL on its own opens nothing. That is the entire point: the two
     * halves travel by different routes, and only one of them is in the
     * address bar.
     */
    @Transactional
    MechanicAccessSession requireActiveReadOnlySession(UUID sessionId, String presentedToken) {
        return requireActiveReadOnlySession(sessionId, presentedToken, true);
    }

    private MechanicAccessSession requireActiveReadOnlySession(
            UUID sessionId, String presentedToken, boolean verifyToken) {
        MechanicAccessSession session = mechanicAccessSessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Mechanic access session was not found."));

        if (verifyToken) {
            String expected = session.getSessionToken();
            /*
             * A session row with no token predates this check. Refusing it
             * would strip access from a link an owner has already approved, to
             * enforce a secret that was never issued, so those fall back to the
             * id alone and say so in the log. An attacker cannot reach this
             * branch: the value is server-side, not anything they send.
             */
            if (expected == null || expected.isBlank()) {
                log.warn("Session {} has no token stored; falling back to id-only access.", sessionId);
            } else if (!MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    (presentedToken == null ? "" : presentedToken).getBytes(StandardCharsets.UTF_8))) {
                /*
                 * Constant-time, and the message is the same one a missing
                 * session gets -- a different wording here would confirm which
                 * ids exist to anyone guessing.
                 */
                throw new ResourceNotFoundException("Mechanic access session was not found.");
            }
        }
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

    /**
     * Spends one AI search from the session's allowance, returning false once
     * it is exhausted. Callers fall back to the free keyword path rather than
     * failing: the mechanic still gets an answer, we just stop paying for the
     * model. Kept here because this class owns the session row.
     */
    @Transactional
    boolean tryConsumeAiSearchBudget(MechanicAccessSession session, int budget) {
        if (budget <= 0) {
            return false;
        }
        MechanicAccessSession current = mechanicAccessSessionRepository
                .findById(session.getMechanicAccessSessionId())
                .orElse(session);
        if (current.getAiSearchCount() >= budget) {
            return false;
        }
        current.setAiSearchCount(current.getAiSearchCount() + 1);
        mechanicAccessSessionRepository.save(current);
        return true;
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
        List<ServiceRecordItem> items = serviceRecordItemReader.forRecord(record.getRecordId());
        return MechanicSharedServiceRecordResponse.from(record, items, sourceDraft);
    }

    /**
     * The plate, for the approved mechanic only.
     *
     * <p>Reached through the session's own vehicle id, so it is scoped by the
     * same approval and expiry as every other field on this response. Null when
     * the owner has not recorded one; the mechanic view says so plainly rather
     * than implying the vehicle has no plate.
     */
    private String vehiclePlateNumber(UUID vehicleId) {
        return vehicleRepository.findById(vehicleId)
                .map(VehicleProfile::getPlateNumber)
                .orElse(null);
    }

    /** Null when the vehicle predates the body-type picker — the map then
        lists the components without a drawing rather than inventing one. */
    private String vehicleBodyType(UUID vehicleId) {
        return vehicleRepository.findById(vehicleId)
                .map(VehicleProfile::getBodyType)
                .orElse(null);
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
