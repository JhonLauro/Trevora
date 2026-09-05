package com.trevora.api.features.concern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.shared.exception.UnauthorizedVehicleAccessException;
import com.trevora.api.features.vehicle.VehicleService;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Owner scoping, and the resolved/open split.
 *
 * <p>The scoping tests matter more here than on most tables. A concern is the
 * owner writing freely about their own car, expecting nobody but a mechanic
 * they approved to read it.
 */
class ConcernServiceTest {
    private static final UUID VEHICLE = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();

    private ConcernRepository concerns;
    private VehicleService vehicles;
    private CurrentUserService currentUser;
    private ConcernService service;

    @BeforeEach
    void setUp() {
        concerns = mock(ConcernRepository.class);
        vehicles = mock(VehicleService.class);
        currentUser = mock(CurrentUserService.class);
        when(currentUser.getCurrentUserId()).thenReturn(OWNER);
        service = new ConcernService(concerns, vehicles, currentUser);
    }

    private static Concern concern(String note, Instant resolvedAt) {
        Concern concern = new Concern();
        concern.setConcernId(UUID.randomUUID());
        concern.setVehicleId(VEHICLE);
        concern.setOwnerId(OWNER);
        concern.setNote(note);
        concern.setResolvedAt(resolvedAt);
        return concern;
    }

    @Test
    @DisplayName("reading a vehicle's concerns checks the vehicle is the caller's")
    void listVerifiesOwnership() {
        service.listForVehicle(VEHICLE);

        verify(vehicles).verifyVehicleBelongsToCurrentUser(VEHICLE);
        verify(concerns).findByVehicleIdAndOwnerIdOrderByCreatedAtDesc(VEHICLE, OWNER);
    }

    @Test
    @DisplayName("someone else's vehicle yields nothing, not a filtered list")
    void anotherOwnersVehicleIsRefused() {
        when(vehicles.verifyVehicleBelongsToCurrentUser(VEHICLE))
                .thenThrow(new UnauthorizedVehicleAccessException("not yours"));

        assertThatThrownBy(() -> service.listForVehicle(VEHICLE))
                .isInstanceOf(UnauthorizedVehicleAccessException.class);
        verify(concerns, never()).findByVehicleIdAndOwnerIdOrderByCreatedAtDesc(any(), any());
    }

    @Test
    @DisplayName("writing a concern checks ownership before it saves")
    void createVerifiesOwnership() {
        when(concerns.save(any())).thenAnswer(call -> call.getArgument(0));

        service.create(VEHICLE, new ConcernRequest("  AC not cold  "));

        verify(vehicles).verifyVehicleBelongsToCurrentUser(VEHICLE);
    }

    @Test
    @DisplayName("the note is stored as written, trimmed and not otherwise touched")
    void theNoteIsStoredVerbatim() {
        when(concerns.save(any())).thenAnswer(call -> call.getArgument(0));

        Concern saved = service.create(VEHICLE, new ConcernRequest("  weird sound when turning left \n"));

        // Trimmed, because trailing newlines are an artefact of a textarea and
        // not something the owner meant. Nothing else: no casing, no
        // normalising, no parsing.
        assertThat(saved.getNote()).isEqualTo("weird sound when turning left");
        assertThat(saved.getOwnerId()).isEqualTo(OWNER);
        assertThat(saved.getVehicleId()).isEqualTo(VEHICLE);
    }

    @Test
    @DisplayName("a mechanic's read returns open concerns only")
    void mechanicReadIsOpenOnly() {
        service.listOpenForVehicle(VEHICLE);

        // The repository method itself is the filter, so a resolved concern
        // cannot reach a mechanic by anyone forgetting to filter downstream.
        verify(concerns).findByVehicleIdAndResolvedAtIsNullOrderByCreatedAtDesc(VEHICLE);
    }

    @Test
    @DisplayName("a mechanic's read does not require a signed-in owner")
    void mechanicReadNeedsNoCurrentUser() {
        /*
         * A mechanic has no account. The session token was checked by the
         * caller, and that is the authorisation — asking for a current user
         * here would fail on the one path that legitimately has none.
         */
        when(concerns.findByVehicleIdAndResolvedAtIsNullOrderByCreatedAtDesc(VEHICLE))
                .thenReturn(List.of(concern("AC not cold", null)));

        assertThat(service.listOpenForVehicle(VEHICLE)).hasSize(1);
        verify(vehicles, never()).verifyVehicleBelongsToCurrentUser(any());
    }

    @Test
    @DisplayName("resolving records when, and reopening clears it")
    void resolveAndReopen() {
        Concern open = concern("AC not cold", null);
        when(concerns.findByConcernIdAndOwnerId(open.getConcernId(), OWNER)).thenReturn(Optional.of(open));
        when(concerns.save(any())).thenAnswer(call -> call.getArgument(0));

        assertThat(service.setResolved(open.getConcernId(), true).getResolvedAt()).isNotNull();
        assertThat(service.setResolved(open.getConcernId(), false).getResolvedAt()).isNull();
    }

    @Test
    @DisplayName("resolving is refused on a concern that is not the caller's")
    void resolveVerifiesOwnership() {
        UUID other = UUID.randomUUID();
        when(concerns.findByConcernIdAndOwnerId(other, OWNER)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.setResolved(other, true))
                .hasMessageContaining("Concern was not found");
    }

    @Test
    @DisplayName("editing rewrites the note and nothing else")
    void editingKeepsEverythingElse() {
        Concern existing = concern("weird sound", null);
        when(concerns.findByConcernIdAndOwnerId(existing.getConcernId(), OWNER)).thenReturn(Optional.of(existing));
        when(concerns.save(any())).thenAnswer(call -> call.getArgument(0));

        Concern updated = service.updateNote(
                existing.getConcernId(), new ConcernRequest("weird sound when turning left, only when cold"));

        assertThat(updated.getNote()).isEqualTo("weird sound when turning left, only when cold");
        assertThat(updated.getResolvedAt()).isNull();
        assertThat(updated.getVehicleId()).isEqualTo(VEHICLE);
    }

    @Test
    @DisplayName("open is exactly resolvedAt being null")
    void openIsResolvedAtNull() {
        assertThat(concern("x", null).isOpen()).isTrue();
        assertThat(concern("x", Instant.now()).isOpen()).isFalse();
    }
}
