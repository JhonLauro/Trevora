package com.trevora.api.features.mechanicaccess;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import com.trevora.api.features.servicerecord.ServiceRecordItemReader;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Covers the keyword fallback: the path taken whenever OPENAI_API_KEY is unset
 * or the API call fails. No key is configured in these tests, so the AI branch
 * short-circuits and every case exercises the scoring code rather than a model.
 *
 * That path is worth pinning down precisely because it is the invisible one --
 * it runs on a demo machine with no network, and until now it answered a
 * naturally-phrased question with nothing at all.
 */
class MechanicSearchRankingTest {

    private final UUID sessionId = UUID.randomUUID();
    private final UUID vehicleId = UUID.randomUUID();
    private final UUID ownerId = UUID.randomUUID();

    private final UUID brakeRecord = UUID.randomUUID();
    private final UUID oilRecord = UUID.randomUUID();
    private final UUID clutchRecord = UUID.randomUUID();

    /** Ids are @GeneratedValue with no setter, so a unit test has to place them directly. */
    private static void setField(Object entity, String field, Object value) {
        try {
            Field target = entity.getClass().getDeclaredField(field);
            target.setAccessible(true);
            target.set(entity, value);
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException("Could not set " + field, exception);
        }
    }

    private ServiceRecord record(UUID id, LocalDate date, String shop, String remarks) {
        ServiceRecord record = new ServiceRecord();
        setField(record, "recordId", id);
        record.setVehicleId(vehicleId);
        record.setOwnerId(ownerId);
        record.setServiceDate(date);
        record.setShopName(shop);
        record.setRemarks(remarks);
        record.setTotalCost(new BigDecimal("1000"));
        return record;
    }

    private ServiceRecordItem item(UUID recordId, String type, String parts, String labor) {
        ServiceRecordItem item = new ServiceRecordItem();
        item.setRecordId(recordId);
        item.setServiceType(type);
        item.setPartsReplaced(parts);
        item.setLaborPerformed(labor);
        return item;
    }

    private record Fixture(MechanicSearchService service, ServiceRecordItemReader reader) {
    }

    private Fixture fixture() {
        MechanicAccessService access = mock(MechanicAccessService.class);
        ServiceRecordItemReader reader = mock(ServiceRecordItemReader.class);

        MechanicAccessSession session = new MechanicAccessSession();
        setField(session, "mechanicAccessSessionId", sessionId);
        session.setVehicleId(vehicleId);
        session.setOwnerId(ownerId);

        List<ServiceRecord> records = List.of(
                record(brakeRecord, LocalDate.of(2026, 5, 10), "Cebu Auto", "customer reported squealing"),
                record(oilRecord, LocalDate.of(2026, 3, 2), "Quick Lube", null),
                record(clutchRecord, LocalDate.of(2025, 11, 20), "Gear Masters", null)
        );

        Map<UUID, List<ServiceRecordItem>> items = new LinkedHashMap<>();
        items.put(brakeRecord, List.of(item(brakeRecord, "Brake service", "front rotors", "resurface discs")));
        items.put(oilRecord, List.of(item(oilRecord, "Oil change", "oil filter", "drain and refill")));
        items.put(clutchRecord, List.of(item(clutchRecord, "Clutch replacement", "clutch kit", "gearbox removal")));

        // Search now presents the session token alongside the id; these tests
        // pass null and stub accordingly, since what they exercise is the
        // ranking, not the guard (see MechanicSessionTokenTest for that).
        when(access.requireActiveReadOnlySession(sessionId, null)).thenReturn(session);
        when(access.getSessionRecords(session)).thenReturn(records);
        when(access.vehicleLabel(vehicleId)).thenReturn("Toyota Vios");
        when(reader.forRecords(any())).thenReturn(items);
        when(access.toSharedRecord(any())).thenAnswer(invocation -> {
            ServiceRecord source = invocation.getArgument(0);
            return MechanicSharedServiceRecordResponse.from(source, items.get(source.getRecordId()));
        });

        // Empty api key -> aiDecision() returns empty without a network call.
        MechanicSearchService service =
                new MechanicSearchService(access, reader, new ObjectMapper(), "", "gpt-4o", 30);
        return new Fixture(service, reader);
    }

    private List<UUID> idsFor(String query) {
        return fixture().service().searchSharedRecords(sessionId, query, null).records().stream()
                .map(MechanicSharedServiceRecordResponse::recordId)
                .toList();
    }

    @Test
    @DisplayName("a naturally-phrased question finds the record")
    void multiWordQuestionMatches() {
        // The old matcher asked whether any single field contained this entire
        // sentence, so this returned nothing.
        List<UUID> ids = idsFor("was the clutch ever replaced?");
        assertFalse(ids.isEmpty(), "multi-word question should reach the clutch record");
        assertEquals(clutchRecord, ids.get(0));
    }

    @Test
    @DisplayName("a part name reaches its family: rotors -> brake service")
    void synonymFamilyMatches() {
        assertTrue(idsFor("any problem with the rotors?").contains(brakeRecord));
    }

    @Test
    @DisplayName("results are ordered by match strength, not by date")
    void resultsAreRanked() {
        // The brake record is the most recent, but "oil" hits the oil record's
        // service type and its parts, so the oil record has to lead.
        assertEquals(oilRecord, idsFor("oil change").get(0), "strongest match should rank first");
    }

    @Test
    @DisplayName("an unrelated question matches nothing rather than everything")
    void unrelatedQueryReturnsNothing() {
        assertTrue(idsFor("windshield tint").isEmpty());
    }

    @Test
    @DisplayName("question words alone do not match every record")
    void stopwordsAreNotTerms() {
        // "what was done" is all stopwords; without the filter these would each
        // substring-match something and return the whole history as a "result".
        assertTrue(idsFor("what was done to it?").isEmpty());
    }

    @Test
    @DisplayName("line items are fetched once per search, not once per record")
    void itemsAreBatchLoaded() {
        Fixture fixture = fixture();
        fixture.service().searchSharedRecords(sessionId, "brake pads and oil filter", null);
        verify(fixture.reader(), times(1)).forRecords(any());
        verify(fixture.reader(), never()).forRecord(any());
    }
}
