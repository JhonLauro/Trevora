package com.trevora.api.features.sharing;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.features.sharing.AccessDecisionResponse;
import com.trevora.api.features.sharing.MechanicAccessRequestResponse;
import com.trevora.api.features.sharing.MechanicAccessSessionResponse;
import com.trevora.api.shared.exception.AccessRequestException;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import com.trevora.api.features.sharing.MechanicAccessRequest;
import com.trevora.api.features.mechanicaccess.MechanicAccessSession;
import com.trevora.api.features.sharing.QRAccessRequest;
import com.trevora.api.features.vehicle.VehicleProfile;
import com.trevora.api.features.sharing.MechanicAccessRepository;
import com.trevora.api.features.mechanicaccess.MechanicAccessSessionRepository;
import com.trevora.api.features.sharing.QRAccessRepository;
import com.trevora.api.features.vehicle.VehicleRepository;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccessApprovalService {
    public static final String REQUEST_PENDING = "PENDING";
    public static final String REQUEST_APPROVED = "APPROVED";
    public static final String REQUEST_DENIED = "DENIED";
    public static final String SESSION_APPROVED = "APPROVED";
    public static final String PERMISSION_READ_ONLY = "READ_ONLY";

    private static final Duration SESSION_EXPIRATION = Duration.ofHours(4);
    private static final SecureRandom TOKEN_RANDOM = new SecureRandom();

    private final MechanicAccessRepository mechanicAccessRepository;
    private final MechanicAccessSessionRepository sessionRepository;
    private final QRAccessRepository qrAccessRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleService vehicleService;
    private final CurrentUserService currentUserService;
    private final QRAccessService qrAccessService;

    public AccessApprovalService(
            MechanicAccessRepository mechanicAccessRepository,
            MechanicAccessSessionRepository sessionRepository,
            QRAccessRepository qrAccessRepository,
            VehicleRepository vehicleRepository,
            VehicleService vehicleService,
            CurrentUserService currentUserService,
            QRAccessService qrAccessService
    ) {
        this.mechanicAccessRepository = mechanicAccessRepository;
        this.sessionRepository = sessionRepository;
        this.qrAccessRepository = qrAccessRepository;
        this.vehicleRepository = vehicleRepository;
        this.vehicleService = vehicleService;
        this.currentUserService = currentUserService;
        this.qrAccessService = qrAccessService;
    }

    @Transactional(readOnly = true)
    public List<MechanicAccessRequestResponse> getOwnerAccessRequests(String status) {
        currentUserService.requireVehicleOwner();
        UUID ownerId = currentUserService.getCurrentUserId();
        List<MechanicAccessRequest> requests = blankToNull(status) == null
                ? mechanicAccessRepository.findByOwnerIdOrderByRequestedAtDesc(ownerId)
                : mechanicAccessRepository.findByOwnerIdAndStatusOrderByRequestedAtDesc(ownerId, status.trim().toUpperCase());
        return requests.stream().map(this::toRequestResponse).toList();
    }

    @Transactional
    public AccessDecisionResponse approveRequest(UUID requestId) {
        currentUserService.requireVehicleOwner();
        MechanicAccessRequest request = ownerScopedRequest(requestId);
        if (!REQUEST_PENDING.equals(request.getStatus())) {
            throw new AccessRequestException("Only pending mechanic access requests can be approved.");
        }

        QRAccessRequest qrRequest = qrAccessService.getOwnerScopedQrRequest(
                request.getQrAccessRequestId(),
                currentUserService.getCurrentUserId()
        );
        qrRequest = qrAccessService.expireIfNeeded(qrRequest);
        if (QRAccessService.STATUS_EXPIRED.equals(qrRequest.getStatus())) {
            throw new AccessRequestException("This QR access request has expired and cannot be approved.");
        }

        vehicleService.verifyVehicleBelongsToCurrentUser(request.getVehicleId());
        Instant now = Instant.now();
        request.setStatus(REQUEST_APPROVED);
        request.setDecidedAt(now);
        mechanicAccessRepository.save(request);

        qrRequest.setStatus(QRAccessService.STATUS_APPROVED);
        qrAccessRepository.save(qrRequest);

        MechanicAccessSession session = new MechanicAccessSession();
        session.setMechanicAccessRequestId(request.getMechanicAccessRequestId());
        session.setVehicleId(request.getVehicleId());
        session.setOwnerId(request.getOwnerId());
        session.setMechanicId(request.getMechanicId());
        session.setSessionToken(uniqueSessionToken());
        session.setPermission(PERMISSION_READ_ONLY);
        session.setStatus(SESSION_APPROVED);
        session.setApprovedAt(now);
        session.setExpiresAt(now.plus(SESSION_EXPIRATION));

        MechanicAccessSession savedSession = sessionRepository.save(session);
        return new AccessDecisionResponse(toRequestResponse(request), toSessionResponse(savedSession));
    }

    @Transactional
    public AccessDecisionResponse denyRequest(UUID requestId) {
        currentUserService.requireVehicleOwner();
        MechanicAccessRequest request = ownerScopedRequest(requestId);
        if (!REQUEST_PENDING.equals(request.getStatus())) {
            throw new AccessRequestException("Only pending mechanic access requests can be denied.");
        }

        QRAccessRequest qrRequest = qrAccessService.getOwnerScopedQrRequest(
                request.getQrAccessRequestId(),
                currentUserService.getCurrentUserId()
        );
        request.setStatus(REQUEST_DENIED);
        request.setDecidedAt(Instant.now());
        mechanicAccessRepository.save(request);

        qrRequest.setStatus(QRAccessService.STATUS_DENIED);
        qrAccessRepository.save(qrRequest);

        return new AccessDecisionResponse(toRequestResponse(request), null);
    }

    private MechanicAccessRequest ownerScopedRequest(UUID requestId) {
        return mechanicAccessRepository
                .findByMechanicAccessRequestIdAndOwnerId(requestId, currentUserService.getCurrentUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Mechanic access request was not found."));
    }

    private MechanicAccessRequestResponse toRequestResponse(MechanicAccessRequest request) {
        VehicleProfile vehicle = vehicleRepository.findById(request.getVehicleId())
                .orElseThrow(() -> new ResourceNotFoundException("Vehicle profile was not found."));
        return MechanicAccessRequestResponse.from(request, vehicleLabel(vehicle));
    }

    private MechanicAccessSessionResponse toSessionResponse(MechanicAccessSession session) {
        return MechanicAccessSessionResponse.from(session, qrAccessService.vehicleLabel(session.getVehicleId()));
    }

    private String uniqueSessionToken() {
        String token;
        do {
            byte[] bytes = new byte[24];
            TOKEN_RANDOM.nextBytes(bytes);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } while (sessionRepository.findBySessionToken(token).isPresent());
        return token;
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
        return label.isEmpty() ? "Selected vehicle" : label.toString();
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
