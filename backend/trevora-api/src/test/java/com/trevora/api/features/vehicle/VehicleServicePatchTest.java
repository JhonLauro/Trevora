package com.trevora.api.features.vehicle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.mechanicaccess.MechanicAccessSessionRepository;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.sharing.MechanicAccessRepository;
import com.trevora.api.features.sharing.QRAccessRepository;
import com.trevora.api.shared.exception.InvalidVehicleUpdateException;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * What a partial edit does to the fields it did not mention: nothing.
 *
 * <p>This is the property the endpoint exists for. Under the whole-vehicle PUT
 * it replaced, the vehicle page's two dialogs each had to hand back everything
 * the other one owned, and forgetting to was silent — the save succeeded, the
 * screen looked right, and a column was null. These tests are that guarantee
 * moved from a convention callers had to keep into something the server does.
 */
class VehicleServicePatchTest {

    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID VEHICLE = UUID.randomUUID();

    private VehicleService service;
    private VehicleProfile stored;

    @BeforeEach
    void setUp() {
        VehicleRepository vehicles = mock(VehicleRepository.class);
        CurrentUserService users = mock(CurrentUserService.class);

        stored = new VehicleProfile();
        stored.setOwnerId(OWNER);
        stored.setMake("Toyota");
        stored.setModel("Vios");
        stored.setBodyType("sedan");
        stored.setNickname("The white one");
        stored.setPlateNumber("ABC 1234");
        stored.setVinChassisNumber("PM2SA1234N1234567");
        stored.setYear(2018);
        stored.setOdometer(42_300);
        stored.setPhoto("vehicle-photos", "owner/v1.jpg");
        stored.setWarrantyStartDate(LocalDate.of(2025, 3, 14));
        stored.setWarrantyMonths(36);
        stored.setWarrantyKmLimit(100_000);

        when(users.getCurrentUserId()).thenReturn(OWNER);
        when(vehicles.findByVehicleIdAndOwnerId(any(), any())).thenReturn(Optional.of(stored));
        when(vehicles.save(any(VehicleProfile.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        service = new VehicleService(
                vehicles,
                users,
                mock(ServiceRecordRepository.class),
                mock(ServiceDraftRepository.class),
                mock(QRAccessRepository.class),
                mock(MechanicAccessRepository.class),
                mock(MechanicAccessSessionRepository.class));
    }

    /** The details dialog's save: four registration fields, nothing else. */
    @Test
    void leavesTheWarrantyAloneWhenOnlyThePlateWasSent() {
        PatchVehicleRequest request = new PatchVehicleRequest();
        request.setPlateNumber("XYZ 9876");

        VehicleProfile saved = service.patchVehicleForCurrentUser(VEHICLE, request);

        assertThat(saved.getPlateNumber()).isEqualTo("XYZ 9876");
        assertThat(saved.getWarrantyStartDate()).isEqualTo(LocalDate.of(2025, 3, 14));
        assertThat(saved.getWarrantyMonths()).isEqualTo(36);
        assertThat(saved.getWarrantyKmLimit()).isEqualTo(100_000);
    }

    /** The warranty dialog's save, and the direction that did not exist before. */
    @Test
    void leavesTheRegistrationFieldsAloneWhenOnlyWarrantyWasSent() {
        PatchVehicleRequest request = new PatchVehicleRequest();
        request.setWarrantyMonths(60);

        VehicleProfile saved = service.patchVehicleForCurrentUser(VEHICLE, request);

        assertThat(saved.getWarrantyMonths()).isEqualTo(60);
        assertThat(saved.getPlateNumber()).isEqualTo("ABC 1234");
        assertThat(saved.getVinChassisNumber()).isEqualTo("PM2SA1234N1234567");
        assertThat(saved.getYear()).isEqualTo(2018);
        assertThat(saved.getOdometer()).isEqualTo(42_300);
        assertThat(saved.getMake()).isEqualTo("Toyota");
        assertThat(saved.getPhotoPath()).isEqualTo("owner/v1.jpg");
    }

    /**
     * The reason absent and null had to stay distinguishable.
     *
     * <p>Emptying a warranty term is a legitimate edit — an owner who typed the
     * wrong purchase date must be able to take it back out rather than replace
     * it with a different wrong one.
     */
    @Test
    void clearsAFieldSentAsNull() {
        PatchVehicleRequest request = new PatchVehicleRequest();
        request.setWarrantyStartDate(null);

        VehicleProfile saved = service.patchVehicleForCurrentUser(VEHICLE, request);

        assertThat(saved.getWarrantyStartDate()).isNull();
        // Clearing one term leaves the others standing: partial warranty terms
        // are the common case, not an error state.
        assertThat(saved.getWarrantyMonths()).isEqualTo(36);
        assertThat(saved.getWarrantyKmLimit()).isEqualTo(100_000);
    }

    @Test
    void treatsAnEmptyStringAsClearingAnOptionalTextField() {
        PatchVehicleRequest request = new PatchVehicleRequest();
        request.setPlateNumber("  ");

        assertThat(service.patchVehicleForCurrentUser(VEHICLE, request).getPlateNumber()).isNull();
    }

    @Test
    void refusesToClearAColumnThatCannotBeNull() {
        PatchVehicleRequest request = new PatchVehicleRequest();
        request.setMake(null);

        assertThatThrownBy(() -> service.patchVehicleForCurrentUser(VEHICLE, request))
                .isInstanceOf(InvalidVehicleUpdateException.class)
                .hasMessageContaining("Make");
    }

    /**
     * An empty patch is a caller bug — a payload built from the wrong variable,
     * or field names that do not match. Answering 200 would hide it behind a
     * screen that never changes.
     */
    @Test
    void refusesABodyThatNamesNoField() {
        assertThatThrownBy(() -> service.patchVehicleForCurrentUser(VEHICLE, new PatchVehicleRequest()))
                .isInstanceOf(InvalidVehicleUpdateException.class);
    }

    /** A path without its bucket cannot be read back; PATCH is the first thing able to send one. */
    @Test
    void refusesHalfAPhotoPointer() {
        PatchVehicleRequest request = new PatchVehicleRequest();
        request.setPhotoPath("owner/new.jpg");

        assertThatThrownBy(() -> service.patchVehicleForCurrentUser(VEHICLE, request))
                .isInstanceOf(InvalidVehicleUpdateException.class)
                .hasMessageContaining("photoBucket");
    }

    @Test
    void acceptsAWholePhotoPointer() {
        PatchVehicleRequest request = new PatchVehicleRequest();
        request.setPhotoBucket("vehicle-photos");
        request.setPhotoPath("owner/new.jpg");

        VehicleProfile saved = service.patchVehicleForCurrentUser(VEHICLE, request);

        assertThat(saved.getPhotoPath()).isEqualTo("owner/new.jpg");
        assertThat(saved.getPhotoBucket()).isEqualTo("vehicle-photos");
    }

    @Test
    void clearsBothHalvesOfThePhotoPointerTogether() {
        PatchVehicleRequest request = new PatchVehicleRequest();
        request.setPhotoBucket(null);
        request.setPhotoPath(null);

        VehicleProfile saved = service.patchVehicleForCurrentUser(VEHICLE, request);

        assertThat(saved.getPhotoPath()).isNull();
        assertThat(saved.getPhotoBucket()).isNull();
    }

    @Test
    void setsAnOdometerOfZeroRatherThanTreatingItAsAbsent() {
        PatchVehicleRequest request = new PatchVehicleRequest();
        request.setOdometer(0);

        // A brand-new vehicle genuinely reads 0, and a truthiness check
        // somewhere in this chain would quietly drop it.
        assertThat(service.patchVehicleForCurrentUser(VEHICLE, request).getOdometer()).isZero();
    }
}
