package com.trevora.api.features.mechanicaccess;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import com.trevora.api.features.servicerecord.ServiceRecordItemReader;
import com.trevora.api.shared.exception.AccessRequestException;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Search is reachable with a session id alone -- no bearer token -- and each
 * AI-backed call spends a request on the most expensive model we use. These
 * cover the two things that stop that from being an open tab on our OpenAI
 * account: a cap on how much text one question can push into the prompt, and a
 * per-session ceiling on how many of those calls a session may ever make.
 */
class MechanicSearchBudgetTest {

    private final UUID sessionId = UUID.randomUUID();
    private final UUID vehicleId = UUID.randomUUID();
    private final UUID ownerId = UUID.randomUUID();
    private final UUID recordId = UUID.randomUUID();

    private static void setField(Object entity, String field, Object value) {
        try {
            Field target = entity.getClass().getDeclaredField(field);
            target.setAccessible(true);
            target.set(entity, value);
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private MechanicAccessService access;

    private MechanicSearchService service(String apiKey, int budget) {
        access = mock(MechanicAccessService.class);
        ServiceRecordItemReader reader = mock(ServiceRecordItemReader.class);

        MechanicAccessSession session = new MechanicAccessSession();
        setField(session, "mechanicAccessSessionId", sessionId);
        session.setVehicleId(vehicleId);
        session.setOwnerId(ownerId);

        ServiceRecord record = new ServiceRecord();
        setField(record, "recordId", recordId);
        record.setVehicleId(vehicleId);
        record.setOwnerId(ownerId);
        record.setShopName("Cebu Auto");
        record.setServiceDate(LocalDate.of(2026, 5, 10));

        // Search now presents the session token alongside the id; these tests
        // pass null and stub accordingly, since what they exercise is the
        // ranking, not the guard (see MechanicSessionTokenTest for that).
        when(access.requireActiveReadOnlySession(sessionId, null)).thenReturn(session);
        when(access.getSessionRecords(session)).thenReturn(List.of(record));
        when(access.vehicleLabel(vehicleId)).thenReturn("Toyota Vios");
        when(reader.forRecords(any())).thenReturn(Map.<UUID, List<ServiceRecordItem>>of(recordId, List.of()));
        when(access.toSharedRecord(any())).thenAnswer(
                invocation -> MechanicSharedServiceRecordResponse.from(invocation.getArgument(0), List.of()));

        return new MechanicSearchService(access, reader, new ObjectMapper(), apiKey, "gpt-4o", budget);
    }

    @Test
    @DisplayName("a question past the character cap is rejected before any spend")
    void overlongQueryIsRejected() {
        MechanicSearchService search = service("sk-test", 30);
        String tooLong = "brake".repeat(MechanicSearchService.MAX_QUERY_CHARS);

        AccessRequestException thrown =
                assertThrows(AccessRequestException.class, () -> search.searchSharedRecords(sessionId, tooLong, null));

        assertTrue(thrown.getMessage().contains("too long"));
        verify(access, never()).tryConsumeAiSearchBudget(any(), anyInt());
    }

    @Test
    @DisplayName("a question at the cap is still accepted")
    void queryAtTheCapIsAccepted() {
        MechanicSearchService search = service("", 30);
        String atCap = "b".repeat(MechanicSearchService.MAX_QUERY_CHARS);

        assertEquals(atCap, search.searchSharedRecords(sessionId, atCap, null).query());
    }

    @Test
    @DisplayName("an exhausted budget degrades to keyword search instead of failing")
    void exhaustedBudgetFallsBackToKeywordSearch() {
        MechanicSearchService search = service("sk-test", 30);
        when(access.tryConsumeAiSearchBudget(any(), anyInt())).thenReturn(false);

        MechanicSearchResponse response = search.searchSharedRecords(sessionId, "were the brakes done?", null);

        assertEquals("KEYWORD_FALLBACK", response.answerSource());
    }

    @Test
    @DisplayName("no configured key spends no budget")
    void missingApiKeySpendsNoBudget() {
        MechanicSearchService search = service("", 30);

        search.searchSharedRecords(sessionId, "were the brakes done?", null);

        verify(access, never()).tryConsumeAiSearchBudget(any(), anyInt());
    }
}
