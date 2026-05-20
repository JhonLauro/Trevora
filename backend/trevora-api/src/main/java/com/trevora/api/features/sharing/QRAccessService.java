package com.trevora.api.features.sharing;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.features.sharing.CreateMechanicAccessRequest;
import com.trevora.api.features.sharing.CreateQRAccessRequest;
import com.trevora.api.features.sharing.MechanicAccessRequestResponse;
import com.trevora.api.features.sharing.MechanicAccessSessionResponse;
import com.trevora.api.features.sharing.PublicMechanicRequestStatusResponse;
import com.trevora.api.features.sharing.PublicQRAccessRequestResponse;
import com.trevora.api.features.sharing.QRAccessRequestResponse;
import com.trevora.api.shared.exception.AccessRequestException;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import com.trevora.api.features.sharing.MechanicAccessRequest;
import com.trevora.api.features.sharing.QRAccessRequest;
import com.trevora.api.features.vehicle.VehicleProfile;
import com.trevora.api.features.sharing.MechanicAccessRepository;
import com.trevora.api.features.mechanicaccess.MechanicAccessSessionRepository;
import com.trevora.api.features.sharing.QRAccessRepository;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.vehicle.VehicleRepository;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QRAccessService {
    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_REQUESTED = "REQUESTED";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_DENIED = "DENIED";
    public static final String STATUS_EXPIRED = "EXPIRED";

    private static final Duration QR_EXPIRATION = Duration.ofHours(24);
    private static final SecureRandom TOKEN_RANDOM = new SecureRandom();

    private final QRAccessRepository qrAccessRepository;
    private final MechanicAccessRepository mechanicAccessRepository;
    private final MechanicAccessSessionRepository sessionRepository;
    private final ServiceRecordRepository serviceRecordRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleService vehicleService;
    private final CurrentUserService currentUserService;
    private final String frontendBaseUrl;

    public QRAccessService(
            QRAccessRepository qrAccessRepository,
            MechanicAccessRepository mechanicAccessRepository,
            MechanicAccessSessionRepository sessionRepository,
            ServiceRecordRepository serviceRecordRepository,
            VehicleRepository vehicleRepository,
            VehicleService vehicleService,
            CurrentUserService currentUserService,
            @Value("${trevora.frontend-base-url:http://localhost:5173}") String frontendBaseUrl
    ) {
        this.qrAccessRepository = qrAccessRepository;
        this.mechanicAccessRepository = mechanicAccessRepository;
        this.sessionRepository = sessionRepository;
        this.serviceRecordRepository = serviceRecordRepository;
        this.vehicleRepository = vehicleRepository;
        this.vehicleService = vehicleService;
        this.currentUserService = currentUserService;
        this.frontendBaseUrl = frontendBaseUrl;
    }

    @Transactional
    public QRAccessRequestResponse createAccessRequest(CreateQRAccessRequest request) {
        currentUserService.requireVehicleOwner();
        if (request.vehicleProfileId() == null) {
            throw new AccessRequestException("vehicleProfileId is required.");
        }

        VehicleProfile vehicle = vehicleService.verifyVehicleBelongsToCurrentUser(request.vehicleProfileId());
        QRAccessRequest qrRequest = new QRAccessRequest();
        qrRequest.setVehicleId(vehicle.getVehicleId());
        qrRequest.setOwnerId(currentUserService.getCurrentUserId());
        qrRequest.setAccessToken(uniqueToken());
        qrRequest.setStatus(STATUS_ACTIVE);
        qrRequest.setExpiresAt(Instant.now().plus(QR_EXPIRATION));

        QRAccessRequest saved = qrAccessRepository.save(qrRequest);
        return toOwnerResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<QRAccessRequestResponse> getVehicleAccessRequests(UUID vehicleId) {
        currentUserService.requireVehicleOwner();
        vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId);
        return qrAccessRepository
                .findByVehicleIdAndOwnerIdOrderByCreatedAtDesc(vehicleId, currentUserService.getCurrentUserId())
                .stream()
                .map(this::toOwnerResponse)
                .toList();
    }

    @Transactional
    public PublicQRAccessRequestResponse getPublicRequest(String token) {
        QRAccessRequest request = getValidTokenRequest(token);
        VehicleProfile vehicle = vehicleRepository.findById(request.getVehicleId())
                .orElseThrow(() -> new ResourceNotFoundException("Shared vehicle was not found."));
        return new PublicQRAccessRequestResponse(
                request.getQrAccessRequestId(),
                request.getVehicleId(),
                vehicleLabel(vehicle),
                vehicle.getPlateNumber(),
                request.getStatus(),
                request.getExpiresAt(),
                serviceRecordRepository.countByVehicleIdAndOwnerId(request.getVehicleId(), request.getOwnerId())
        );
    }

    @Transactional
    public MechanicAccessRequestResponse createMechanicRequest(String token, CreateMechanicAccessRequest request) {
        QRAccessRequest qrRequest = getValidTokenRequest(token);
        if (mechanicAccessRepository.existsByQrAccessRequestIdAndStatus(qrRequest.getQrAccessRequestId(), AccessApprovalService.REQUEST_PENDING)) {
            throw new AccessRequestException("A mechanic access request is already waiting for owner approval.");
        }
        if (mechanicAccessRepository.existsByQrAccessRequestIdAndStatus(qrRequest.getQrAccessRequestId(), STATUS_APPROVED)) {
            throw new AccessRequestException("This share link already has approved mechanic access.");
        }

        MechanicAccessRequest accessRequest = new MechanicAccessRequest();
        accessRequest.setQrAccessRequestId(qrRequest.getQrAccessRequestId());
        accessRequest.setVehicleId(qrRequest.getVehicleId());
        accessRequest.setOwnerId(qrRequest.getOwnerId());
        accessRequest.setMechanicId(null);
        accessRequest.setMechanicName(requiredText(request.mechanicName(), "mechanicName"));
        accessRequest.setShopName(blankToNull(request.shopName()));
        accessRequest.setContactInfo(blankToNull(request.contactInfo()));
        accessRequest.setReason(blankToNull(request.reason()));
        accessRequest.setStatus(AccessApprovalService.REQUEST_PENDING);
        accessRequest.setRequestedAt(Instant.now());

        qrRequest.setStatus(STATUS_REQUESTED);
        qrRequest.setUsedAt(Instant.now());
        qrAccessRepository.save(qrRequest);

        MechanicAccessRequest saved = mechanicAccessRepository.save(accessRequest);
        VehicleProfile vehicle = vehicleRepository.findById(saved.getVehicleId())
                .orElseThrow(() -> new ResourceNotFoundException("Shared vehicle was not found."));
        return MechanicAccessRequestResponse.from(saved, vehicleLabel(vehicle), vehicle.getPlateNumber());
    }

    @Transactional
    public PublicMechanicRequestStatusResponse getMechanicRequestStatus(String token) {
        QRAccessRequest qrRequest = qrAccessRepository.findByAccessToken(token)
                .orElseThrow(() -> new ResourceNotFoundException("Access link was not found."));
        qrRequest = expireIfNeeded(qrRequest);
        PublicQRAccessRequestResponse publicRequest = toPublicResponse(qrRequest);
        MechanicAccessRequestResponse mechanicRequest = mechanicAccessRepository
                .findFirstByQrAccessRequestIdOrderByRequestedAtDesc(qrRequest.getQrAccessRequestId())
                .map(request -> {
                    VehicleProfile vehicle = vehicleRepository.findById(request.getVehicleId())
                            .orElseThrow(() -> new ResourceNotFoundException("Shared vehicle was not found."));
                    return MechanicAccessRequestResponse.from(request, vehicleLabel(vehicle), vehicle.getPlateNumber());
                })
                .orElse(null);
        MechanicAccessSessionResponse session = mechanicRequest == null ? null : sessionRepository
                .findByMechanicAccessRequestId(mechanicRequest.mechanicAccessRequestId())
                .map(accessSession -> MechanicAccessSessionResponse.from(accessSession, vehicleLabel(accessSession.getVehicleId())))
                .orElse(null);

        return new PublicMechanicRequestStatusResponse(publicRequest, mechanicRequest, session);
    }

    QRAccessRequest getOwnerScopedQrRequest(UUID requestId, UUID ownerId) {
        QRAccessRequest request = qrAccessRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("QR access request was not found."));
        if (!ownerId.equals(request.getOwnerId())) {
            throw new AccessRequestException("This access request does not belong to the current owner.");
        }
        return request;
    }

    QRAccessRequest expireIfNeeded(QRAccessRequest request) {
        if (!STATUS_EXPIRED.equals(request.getStatus()) && request.getExpiresAt().isBefore(Instant.now())) {
            request.setStatus(STATUS_EXPIRED);
            return qrAccessRepository.save(request);
        }
        return request;
    }

    String vehicleLabel(UUID vehicleId) {
        return vehicleRepository.findById(vehicleId)
                .map(this::vehicleLabel)
                .orElse("Selected vehicle");
    }

    private QRAccessRequest getValidTokenRequest(String token) {
        QRAccessRequest request = qrAccessRepository.findByAccessToken(token)
                .orElseThrow(() -> new ResourceNotFoundException("Access link was not found."));
        request = expireIfNeeded(request);
        if (STATUS_EXPIRED.equals(request.getStatus())) {
            throw new AccessRequestException("This access link has expired.");
        }
        if (STATUS_DENIED.equals(request.getStatus())) {
            throw new AccessRequestException("This access link was denied by the owner.");
        }
        if (STATUS_APPROVED.equals(request.getStatus())) {
            throw new AccessRequestException("This access link has already been approved.");
        }
        return request;
    }

    private QRAccessRequestResponse toOwnerResponse(QRAccessRequest request) {
        QRAccessRequest current = expireIfNeeded(request);
        long confirmedRecords = serviceRecordRepository.countByVehicleIdAndOwnerId(
                current.getVehicleId(),
                current.getOwnerId()
        );
        return QRAccessRequestResponse.from(current, accessUrl(current.getAccessToken()), confirmedRecords);
    }

    private PublicQRAccessRequestResponse toPublicResponse(QRAccessRequest request) {
        VehicleProfile vehicle = vehicleRepository.findById(request.getVehicleId())
                .orElseThrow(() -> new ResourceNotFoundException("Shared vehicle was not found."));
        return new PublicQRAccessRequestResponse(
                request.getQrAccessRequestId(),
                request.getVehicleId(),
                vehicleLabel(vehicle),
                vehicle.getPlateNumber(),
                request.getStatus(),
                request.getExpiresAt(),
                serviceRecordRepository.countByVehicleIdAndOwnerId(request.getVehicleId(), request.getOwnerId())
        );
    }

    private String uniqueToken() {
        String token;
        do {
            byte[] bytes = new byte[24];
            TOKEN_RANDOM.nextBytes(bytes);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } while (qrAccessRepository.findByAccessToken(token).isPresent());
        return token;
    }

    private String accessUrl(String token) {
        return frontendBaseUrl.replaceAll("/+$", "") + "/access/request/" + token;
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

    private String requiredText(String value, String fieldName) {
        String cleaned = blankToNull(value);
        if (cleaned == null) {
            throw new AccessRequestException(fieldName + " is required.");
        }
        return cleaned;
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
