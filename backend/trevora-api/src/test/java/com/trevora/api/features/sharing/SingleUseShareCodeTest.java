package com.trevora.api.features.sharing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.mechanicaccess.MechanicAccessSessionRepository;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.vehicle.VehicleProfile;
import com.trevora.api.features.vehicle.VehicleRepository;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import java.lang.reflect.Field;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A share code works for one request.
 *
 * <p>Before this, the code in a QR stayed the key to everything that followed
 * from it. Anyone holding it -- a second person at the counter, a photo of the
 * owner's screen -- could send another request, and could poll the status
 * endpoint until the owner approved and collect the session meant for the
 * mechanic who asked. Sending a request now replaces the code with a token only
 * that mechanic's device receives.
 */
class SingleUseShareCodeTest {

    private final QRAccessRepository qrAccessRepository = mock(QRAccessRepository.class);
    private final MechanicAccessRepository mechanicAccessRepository = mock(MechanicAccessRepository.class);
    private final ServiceRecordRepository serviceRecordRepository = mock(ServiceRecordRepository.class);
    private final VehicleRepository vehicleRepository = mock(VehicleRepository.class);
    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final VehicleService vehicleService = mock(VehicleService.class);

    private final UUID ownerId = UUID.randomUUID();
    private final UUID vehicleId = UUID.randomUUID();

    private QRAccessService service;
    private QRAccessRequest link;
    private String printedCode;

    @BeforeEach
    void setUp() throws Exception {
        service = new QRAccessService(
                qrAccessRepository,
                mechanicAccessRepository,
                mock(MechanicAccessSessionRepository.class),
                serviceRecordRepository,
                vehicleRepository,
                vehicleService,
                currentUserService,
                "https://trevora.app",
                ""
        );

        VehicleProfile vehicle = mock(VehicleProfile.class);
        when(vehicle.getVehicleId()).thenReturn(vehicleId);
        when(vehicleRepository.findById(vehicleId)).thenReturn(Optional.of(vehicle));
        when(vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId)).thenReturn(vehicle);
        when(currentUserService.getCurrentUserId()).thenReturn(ownerId);

        link = new QRAccessRequest();
        Field id = QRAccessRequest.class.getDeclaredField("qrAccessRequestId");
        id.setAccessible(true);
        id.set(link, UUID.randomUUID());
        link.setVehicleId(vehicleId);
        link.setOwnerId(ownerId);
        link.setAccessToken("the-code-in-the-qr");
        link.setStatus(QRAccessService.STATUS_ACTIVE);
        link.setExpiresAt(Instant.now().plus(Duration.ofHours(1)));
        printedCode = link.getAccessToken();

        // Found by whatever its token is now, the way the table would find it.
        when(qrAccessRepository.findByAccessToken(anyString())).thenAnswer(call ->
                call.getArgument(0).equals(link.getAccessToken()) ? Optional.of(link) : Optional.empty());
        when(qrAccessRepository.save(any(QRAccessRequest.class))).thenAnswer(call -> call.getArgument(0));
        when(mechanicAccessRepository.save(any(MechanicAccessRequest.class))).thenAnswer(call -> call.getArgument(0));
    }

    private SubmittedMechanicRequestResponse send() {
        return service.createMechanicRequest(printedCode, new CreateMechanicAccessRequest("Ramon", "Cebu Auto", null, null));
    }

    private QRAccessRequestResponse ownerRow() {
        when(qrAccessRepository.findByVehicleIdAndOwnerIdOrderByCreatedAtDesc(vehicleId, ownerId))
                .thenReturn(List.of(link));
        return service.getVehicleAccessRequests(vehicleId).get(0);
    }

    @Test
    @DisplayName("sending a request retires the code in the QR and gives this device its own")
    void sendingRotatesTheCode() {
        SubmittedMechanicRequestResponse result = send();

        assertThat(result.followToken()).isNotBlank().isNotEqualTo(printedCode);
        assertThat(link.getAccessToken()).isEqualTo(result.followToken());
        assertThat(link.getStatus()).isEqualTo(QRAccessService.STATUS_REQUESTED);
    }

    @Test
    @DisplayName("once used, the QR's code opens neither the request page nor the status")
    void usedCodeOpensNothing() {
        send();

        assertThatThrownBy(() -> service.getPublicRequest(printedCode))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("already been used");
        assertThatThrownBy(() -> service.getMechanicRequestStatus(printedCode))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("already been used");
    }

    @Test
    @DisplayName("a second person cannot send another request with the same code")
    void secondRequestIsRefused() {
        send();

        assertThatThrownBy(() -> service.createMechanicRequest(
                printedCode, new CreateMechanicAccessRequest("Someone else", null, null, null)))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("the mechanic who sent it can still follow the owner's answer with their own token")
    void senderCanStillFollow() {
        SubmittedMechanicRequestResponse result = send();

        PublicMechanicRequestStatusResponse status = service.getMechanicRequestStatus(result.followToken());

        assertThat(status.qrRequest().status()).isEqualTo(QRAccessService.STATUS_REQUESTED);
    }

    @Test
    @DisplayName("the owner's list shows a live link's code but withholds a used one's")
    void ownerSeesCodeOnlyWhileScannable() {
        QRAccessRequestResponse live = ownerRow();
        assertThat(live.accessToken()).isEqualTo(printedCode);
        assertThat(live.accessUrl()).endsWith(printedCode);

        send();
        QRAccessRequestResponse used = ownerRow();

        assertThat(used.accessToken()).isNull();
        assertThat(used.accessUrl()).isNull();
    }
}
