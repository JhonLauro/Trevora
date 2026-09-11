package com.trevora.api.features.sharing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * What generating a share link does to the links a vehicle already has.
 *
 * <p>Each click used to insert a row, so the owner's list grew without limit.
 * A link nobody has scanned is now overwritten in place instead. The line this
 * guards is which rows may be touched: a link a mechanic scanned is an access
 * event, and any session approved from it has its own lifetime, so those rows
 * are never changed -- and no row is ever deleted, because the request and
 * session tables cascade from this one.
 */
class ShareLinkReplacementTest {

    private final QRAccessRepository qrAccessRepository = mock(QRAccessRepository.class);
    private final MechanicAccessRepository mechanicAccessRepository = mock(MechanicAccessRepository.class);
    private final ServiceRecordRepository serviceRecordRepository = mock(ServiceRecordRepository.class);
    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final VehicleService vehicleService = mock(VehicleService.class);

    private final UUID ownerId = UUID.randomUUID();
    private final UUID vehicleId = UUID.randomUUID();

    private QRAccessService service;

    @BeforeEach
    void setUp() {
        service = new QRAccessService(
                qrAccessRepository,
                mechanicAccessRepository,
                mock(MechanicAccessSessionRepository.class),
                serviceRecordRepository,
                mock(VehicleRepository.class),
                vehicleService,
                currentUserService,
                "https://trevora.app",
                ""
        );

        VehicleProfile vehicle = mock(VehicleProfile.class);
        when(vehicle.getVehicleId()).thenReturn(vehicleId);
        when(vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId)).thenReturn(vehicle);
        when(currentUserService.getCurrentUserId()).thenReturn(ownerId);
        when(qrAccessRepository.save(any(QRAccessRequest.class))).thenAnswer(call -> call.getArgument(0));
    }

    private QRAccessRequest link(String status, Duration expiresIn) throws Exception {
        QRAccessRequest link = new QRAccessRequest();
        // The id is database-generated; set it so a request can point at it.
        Field id = QRAccessRequest.class.getDeclaredField("qrAccessRequestId");
        id.setAccessible(true);
        id.set(link, UUID.randomUUID());
        link.setVehicleId(vehicleId);
        link.setOwnerId(ownerId);
        link.setAccessToken(UUID.randomUUID().toString());
        link.setStatus(status);
        link.setExpiresAt(Instant.now().plus(expiresIn));
        return link;
    }

    private QRAccessRequest liveLink() throws Exception {
        return link(QRAccessService.STATUS_ACTIVE, Duration.ofHours(1));
    }

    /** Newest first, the order the repository returns them in. */
    private void onVehicle(QRAccessRequest... links) {
        when(qrAccessRepository.findByVehicleIdAndOwnerIdOrderByCreatedAtDesc(vehicleId, ownerId))
                .thenReturn(List.of(links));
    }

    private QRAccessRequest generate() {
        service.createAccessRequest(new CreateQRAccessRequest(vehicleId));
        ArgumentCaptor<QRAccessRequest> saved = ArgumentCaptor.forClass(QRAccessRequest.class);
        verify(qrAccessRepository, org.mockito.Mockito.atLeastOnce()).save(saved.capture());
        List<QRAccessRequest> all = saved.getAllValues();
        return all.get(all.size() - 1);
    }

    private void neverDeletes() {
        verify(qrAccessRepository, never()).delete(any(QRAccessRequest.class));
        verify(qrAccessRepository, never()).deleteAll(any(Iterable.class));
    }

    @Test
    @DisplayName("generating again overwrites the unscanned link in place: same row, new token, later expiry")
    void overwritesTheLiveUnscannedLink() throws Exception {
        QRAccessRequest live = liveLink();
        String oldToken = live.getAccessToken();
        Instant oldExpiry = live.getExpiresAt();
        onVehicle(live);

        QRAccessRequest result = generate();

        assertThat(result).isSameAs(live);
        assertThat(result.getAccessToken()).isNotEqualTo(oldToken);
        assertThat(result.getExpiresAt()).isAfter(oldExpiry);
        assertThat(result.getExpiresAt())
                .isCloseTo(Instant.now().plus(SharingPolicy.LINK_LIFETIME), within(5, ChronoUnit.SECONDS));
        assertThat(result.getStatus()).isEqualTo(QRAccessService.STATUS_ACTIVE);
        neverDeletes();
    }

    @Test
    @DisplayName("with no live unscanned link, a new row is made")
    void insertsWhenNothingIsLive() throws Exception {
        onVehicle();

        QRAccessRequest result = generate();

        assertThat(result.getVehicleId()).isEqualTo(vehicleId);
        assertThat(result.getOwnerId()).isEqualTo(ownerId);
        assertThat(result.getStatus()).isEqualTo(QRAccessService.STATUS_ACTIVE);
        assertThat(result.getAccessToken()).isNotBlank();
        assertThat(result.getExpiresAt())
                .isCloseTo(Instant.now().plus(SharingPolicy.LINK_LIFETIME), within(5, ChronoUnit.SECONDS));
    }

    @Test
    @DisplayName("a link a mechanic scanned is never overwritten, whatever its status")
    void leavesScannedLinksAlone() throws Exception {
        QRAccessRequest waiting = link(QRAccessService.STATUS_REQUESTED, Duration.ofHours(20));
        QRAccessRequest approved = link(QRAccessService.STATUS_APPROVED, Duration.ofHours(20));
        QRAccessRequest denied = link(QRAccessService.STATUS_DENIED, Duration.ofHours(20));
        waiting.setUsedAt(Instant.now());
        approved.setUsedAt(Instant.now());
        denied.setUsedAt(Instant.now());
        List<String> tokensBefore = List.of(waiting.getAccessToken(), approved.getAccessToken(), denied.getAccessToken());
        onVehicle(waiting, approved, denied);

        QRAccessRequest result = generate();

        assertThat(result).isNotIn(waiting, approved, denied);
        assertThat(List.of(waiting.getAccessToken(), approved.getAccessToken(), denied.getAccessToken()))
                .isEqualTo(tokensBefore);
        assertThat(approved.getStatus()).isEqualTo(QRAccessService.STATUS_APPROVED);
        assertThat(waiting.getStatus()).isEqualTo(QRAccessService.STATUS_REQUESTED);
    }

    /* The two backstops behind "unscanned": used_at, and whether a request row
       points at the link. Either one alone must be enough to protect it. */
    @Test
    @DisplayName("an ACTIVE link that was used, or that a request points at, is not reused")
    void aUsedActiveLinkIsNotReused() throws Exception {
        QRAccessRequest usedButActive = liveLink();
        usedButActive.setUsedAt(Instant.now());
        QRAccessRequest requestedButActive = liveLink();
        when(mechanicAccessRepository.existsByQrAccessRequestId(requestedButActive.getQrAccessRequestId()))
                .thenReturn(true);
        onVehicle(usedButActive, requestedButActive);

        QRAccessRequest result = generate();

        assertThat(result).isNotIn(usedButActive, requestedButActive);
        assertThat(usedButActive.getStatus()).isEqualTo(QRAccessService.STATUS_ACTIVE);
        assertThat(requestedButActive.getStatus()).isEqualTo(QRAccessService.STATUS_ACTIVE);
    }

    /* The status column can still read ACTIVE after the expiry has passed. */
    @Test
    @DisplayName("a link past its expiry is not reused, even if its status still says ACTIVE")
    void aLapsedLinkIsNotReused() throws Exception {
        QRAccessRequest lapsed = link(QRAccessService.STATUS_ACTIVE, Duration.ofHours(-2));
        String lapsedToken = lapsed.getAccessToken();
        onVehicle(lapsed);

        QRAccessRequest result = generate();

        assertThat(result).isNotSameAs(lapsed);
        assertThat(lapsed.getAccessToken()).isEqualTo(lapsedToken);
    }

    @Test
    @DisplayName("older live duplicates from before overwriting stop working, but their rows are kept")
    void olderDuplicatesExpireButStay() throws Exception {
        QRAccessRequest newest = liveLink();
        QRAccessRequest older = liveLink();
        QRAccessRequest oldest = liveLink();
        onVehicle(newest, older, oldest);

        Instant before = Instant.now();
        service.createAccessRequest(new CreateQRAccessRequest(vehicleId));

        assertThat(newest.getStatus()).isEqualTo(QRAccessService.STATUS_ACTIVE);
        for (QRAccessRequest duplicate : List.of(older, oldest)) {
            assertThat(duplicate.getStatus()).isEqualTo(QRAccessService.STATUS_EXPIRED);
            assertThat(duplicate.getExpiresAt()).isBetween(before, Instant.now());
        }
        neverDeletes();
    }

    @Test
    @DisplayName("a mechanic holding a replaced code is told it no longer works and why, not just 'not found'")
    void replacedCodeSaysSo() {
        assertThatThrownBy(() -> service.getPublicRequest("an-old-token"))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("been replaced");
    }

    @Test
    @DisplayName("the link list counts the vehicle's records once, not once per row")
    void countsRecordsOncePerList() throws Exception {
        onVehicle(
                liveLink(),
                link(QRAccessService.STATUS_APPROVED, Duration.ofHours(20)),
                link(QRAccessService.STATUS_DENIED, Duration.ofHours(20))
        );
        when(serviceRecordRepository.countByVehicleIdAndOwnerId(vehicleId, ownerId)).thenReturn(7L);

        List<QRAccessRequestResponse> list = service.getVehicleAccessRequests(vehicleId);

        assertThat(list).hasSize(3);
        assertThat(list).allSatisfy(row -> assertThat(row.confirmedRecordCount()).isEqualTo(7L));
        verify(serviceRecordRepository, times(1)).countByVehicleIdAndOwnerId(vehicleId, ownerId);
    }
}
