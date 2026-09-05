package com.trevora.api.features.mechanicaccess;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.concern.ConcernService;
import com.trevora.api.features.sharing.MechanicAccessRepository;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecordItemReader;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.vehicle.VehicleRepository;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import java.lang.reflect.Field;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * A mechanic's credential used to be the session id alone — and that id lives
 * in the URL, where it survives in history, `Referer` headers, logs and
 * screenshots.
 *
 * <p>The server had always issued a `sessionToken` beside it and handed it to
 * the mechanic's browser on approval; nothing ever checked it. These tests pin
 * the check that now exists, so the URL on its own opens nothing.
 */
class MechanicSessionTokenTest {

    private static final String REAL_TOKEN = "kQ8sV2mZ9xR4tL7pB1nC6wY3";
    private final UUID sessionId = UUID.randomUUID();

    private MechanicAccessSessionRepository sessions;

    private MechanicAccessService serviceWithToken(String storedToken) {
        sessions = mock(MechanicAccessSessionRepository.class);

        MechanicAccessSession session = new MechanicAccessSession();
        setField(session, "mechanicAccessSessionId", sessionId);
        session.setVehicleId(UUID.randomUUID());
        session.setOwnerId(UUID.randomUUID());
        session.setStatus("APPROVED");
        session.setPermission("READ_ONLY");
        session.setExpiresAt(Instant.now().plus(2, ChronoUnit.HOURS));
        session.setSessionToken(storedToken);

        when(sessions.findById(sessionId)).thenReturn(Optional.of(session));

        return new MechanicAccessService(
                sessions,
                mock(MechanicAccessRepository.class),
                mock(ServiceDraftRepository.class),
                mock(ServiceRecordRepository.class),
                mock(ServiceRecordItemReader.class),
                mock(VehicleRepository.class),
                mock(CurrentUserService.class),
                mock(ConcernService.class));
    }

    private static void setField(Object target, String field, Object value) {
        try {
            Field f = target.getClass().getDeclaredField(field);
            f.setAccessible(true);
            f.set(target, value);
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Test
    @DisplayName("the right token opens the session")
    void correctTokenIsAccepted() {
        MechanicAccessService service = serviceWithToken(REAL_TOKEN);
        assertDoesNotThrow(() -> service.requireActiveReadOnlySession(sessionId, REAL_TOKEN));
    }

    @Test
    @DisplayName("the session id alone is no longer enough")
    void missingTokenIsRefused() {
        MechanicAccessService service = serviceWithToken(REAL_TOKEN);
        assertThrows(ResourceNotFoundException.class,
                () -> service.requireActiveReadOnlySession(sessionId, null));
    }

    @Test
    @DisplayName("a wrong token is refused, and says the same thing as a missing session")
    void wrongTokenIsIndistinguishableFromNoSession() {
        MechanicAccessService service = serviceWithToken(REAL_TOKEN);
        ResourceNotFoundException thrown = assertThrows(ResourceNotFoundException.class,
                () -> service.requireActiveReadOnlySession(sessionId, "kQ8sV2mZ9xR4tL7pB1nC6wY4"));

        // Wording that distinguished "wrong token" from "no such session" would
        // confirm which session ids exist to anyone guessing.
        assertEquals("Mechanic access session was not found.", thrown.getMessage());
    }

    @Test
    @DisplayName("a near-miss token is refused")
    void prefixIsNotEnough() {
        MechanicAccessService service = serviceWithToken(REAL_TOKEN);
        assertThrows(ResourceNotFoundException.class,
                () -> service.requireActiveReadOnlySession(sessionId, REAL_TOKEN.substring(0, 20)));
    }

    @Test
    @DisplayName("a session issued before tokens were checked still opens")
    void sessionWithoutStoredTokenFallsBack() {
        // Refusing these would strip access from links owners already approved,
        // to enforce a secret that was never issued to that mechanic.
        MechanicAccessService service = serviceWithToken(null);
        assertDoesNotThrow(() -> service.requireActiveReadOnlySession(sessionId, null));
    }

    @Test
    @DisplayName("owner-side reads do not require a mechanic token")
    void ownerPathIsUnaffected() {
        MechanicAccessService service = serviceWithToken(REAL_TOKEN);
        assertDoesNotThrow(() -> service.requireActiveReadOnlySession(sessionId));
    }
}
