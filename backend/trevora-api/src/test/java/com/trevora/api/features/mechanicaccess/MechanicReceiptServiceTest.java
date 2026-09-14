package com.trevora.api.features.mechanicaccess;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.concern.ConcernService;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordItemReader;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.sharing.MechanicAccessRepository;
import com.trevora.api.features.vehicle.VehicleRepository;
import com.trevora.api.shared.exception.AccessRequestException;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import java.lang.reflect.Field;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClientException;

/**
 * A mechanic is never signed in to Supabase, so the receipts bucket's
 * owner-only policy refused every photo they opened. The API now signs the
 * links with the service-role key, which ignores that policy -- so these tests
 * pin what has to be true before anything is signed.
 */
class MechanicReceiptServiceTest {

    private static final String TOKEN = "kQ8sV2mZ9xR4tL7pB1nC6wY3";
    private static final String SUPABASE = "https://project.supabase.co";

    private final UUID sessionId = UUID.randomUUID();
    private final UUID recordId = UUID.randomUUID();
    private final UUID ownerId = UUID.randomUUID();
    private final UUID vehicleId = UUID.randomUUID();

    private MechanicAccessSession session;
    private ServiceRecordRepository records;
    private FakeLinks links;

    /** Records what would be signed, and answers the ways Storage can. */
    static class FakeLinks extends MechanicReceiptLinks {
        final List<String> signed = new ArrayList<>();
        final List<Long> lifetimes = new ArrayList<>();
        final Set<String> missing = new HashSet<>();
        RestClientException failure;

        FakeLinks(String key) {
            super(SUPABASE, key);
        }

        @Override
        protected String requestSignedPath(String bucket, String path, long expiresInSeconds) {
            if (failure != null) {
                throw failure;
            }
            signed.add(bucket + ":" + path);
            lifetimes.add(expiresInSeconds);
            return missing.contains(path) ? null : "/object/sign/" + bucket + "/" + path + "?token=signed";
        }
    }

    @BeforeEach
    void setUp() {
        session = new MechanicAccessSession();
        setField(session, "mechanicAccessSessionId", sessionId);
        session.setVehicleId(vehicleId);
        session.setOwnerId(ownerId);
        session.setStatus("APPROVED");
        session.setPermission("READ_ONLY");
        session.setExpiresAt(Instant.now().plus(2, ChronoUnit.HOURS));
        session.setSessionToken(TOKEN);

        records = mock(ServiceRecordRepository.class);
        links = new FakeLinks("service-role-key");
    }

    private MechanicReceiptService service() {
        MechanicAccessSessionRepository sessions = mock(MechanicAccessSessionRepository.class);
        when(sessions.findById(sessionId)).thenReturn(Optional.of(session));
        MechanicAccessService access = new MechanicAccessService(
                sessions,
                mock(MechanicAccessRepository.class),
                mock(ServiceDraftRepository.class),
                records,
                mock(ServiceRecordItemReader.class),
                mock(VehicleRepository.class),
                mock(CurrentUserService.class),
                mock(ConcernService.class));
        return new MechanicReceiptService(access, links);
    }

    private void sharedRecord(Map<String, Object> metadata, String mainPath) {
        ServiceRecord record = new ServiceRecord();
        setField(record, "recordId", recordId);
        record.setVehicleId(vehicleId);
        record.setOwnerId(ownerId);
        record.setFieldMetadata(metadata);
        record.setReceiptStorageBucket("service-receipts");
        record.setReceiptStoragePath(mainPath);
        when(records.findByRecordIdAndVehicleIdAndOwnerId(recordId, vehicleId, ownerId))
                .thenReturn(Optional.of(record));
    }

    private void twoPages(String first, String second) {
        sharedRecord(Map.of("storedReceiptPages", List.of(
                Map.of("pageNumber", 1, "bucket", "service-receipts", "path", first),
                Map.of("pageNumber", 2, "bucket", "service-receipts", "path", second))), first);
    }

    private String own(String file) {
        return ownerId + "/" + vehicleId + "/" + file;
    }

    @Test
    @DisplayName("every page the shared record names is signed, in order")
    void signsEveryPage() {
        twoPages(own("page-1.jpg"), own("page-2.jpg"));

        MechanicReceiptPagesResponse response = service().getReceiptPages(sessionId, recordId, TOKEN);

        assertThat(response.pages()).extracting(MechanicReceiptPagesResponse.Page::pageNumber).containsExactly(1, 2);
        assertThat(response.pages().get(0).url()).isEqualTo(
                SUPABASE + "/storage/v1/object/sign/service-receipts/" + own("page-1.jpg") + "?token=signed");
    }

    @Test
    @DisplayName("a record from before multi-page receipts has its one photo signed")
    void signsSingleReceiptPath() {
        sharedRecord(null, own("receipt.jpg"));

        MechanicReceiptPagesResponse response = service().getReceiptPages(sessionId, recordId, TOKEN);

        assertThat(links.signed).containsExactly("service-receipts:" + own("receipt.jpg"));
        assertThat(response.pages()).hasSize(1);
    }

    @Test
    @DisplayName("a wrong token signs nothing")
    void wrongTokenSignsNothing() {
        twoPages(own("page-1.jpg"), own("page-2.jpg"));

        assertThrows(ResourceNotFoundException.class,
                () -> service().getReceiptPages(sessionId, recordId, "kQ8sV2mZ9xR4tL7pB1nC6wY4"));
        assertThat(links.signed).isEmpty();
    }

    @Test
    @DisplayName("an expired session signs nothing")
    void expiredSessionSignsNothing() {
        twoPages(own("page-1.jpg"), own("page-2.jpg"));
        session.setExpiresAt(Instant.now().minus(1, ChronoUnit.MINUTES));

        assertThrows(AccessRequestException.class, () -> service().getReceiptPages(sessionId, recordId, TOKEN));
        assertThat(links.signed).isEmpty();
    }

    @Test
    @DisplayName("a record outside the shared vehicle signs nothing")
    void otherRecordSignsNothing() {
        // No record is found for this vehicle and owner.
        assertThrows(ResourceNotFoundException.class, () -> service().getReceiptPages(sessionId, recordId, TOKEN));
        assertThat(links.signed).isEmpty();
    }

    @Test
    @DisplayName("a path outside the owner's own folder is never signed")
    void refusesOtherAccountsFiles() {
        String someoneElse = UUID.randomUUID() + "/" + UUID.randomUUID() + "/receipt.jpg";
        String climbing = ownerId + "/../" + UUID.randomUUID() + "/receipt.jpg";
        sharedRecord(Map.of("storedReceiptPages", List.of(
                Map.of("pageNumber", 1, "path", someoneElse),
                Map.of("pageNumber", 2, "path", climbing),
                Map.of("pageNumber", 3, "path", own("page-3.jpg")))), someoneElse);

        MechanicReceiptPagesResponse response = service().getReceiptPages(sessionId, recordId, TOKEN);

        assertThat(links.signed).containsExactly("service-receipts:" + own("page-3.jpg"));
        assertThat(response.pages()).extracting(MechanicReceiptPagesResponse.Page::pageNumber).containsExactly(3);
    }

    @Test
    @DisplayName("links last fifteen minutes")
    void linksLastFifteenMinutes() {
        sharedRecord(null, own("receipt.jpg"));

        service().getReceiptPages(sessionId, recordId, TOKEN);

        assertThat(links.lifetimes).containsExactly(MechanicReceiptService.LINK_LIFETIME.getSeconds());
    }

    @Test
    @DisplayName("a link never outlives the session")
    void linkNeverOutlivesSession() {
        sharedRecord(null, own("receipt.jpg"));
        session.setExpiresAt(Instant.now().plus(5, ChronoUnit.MINUTES));

        MechanicReceiptPagesResponse response = service().getReceiptPages(sessionId, recordId, TOKEN);

        assertThat(links.lifetimes.get(0)).isLessThanOrEqualTo(300);
        assertThat(response.expiresAt()).isEqualTo(session.getExpiresAt());
    }

    @Test
    @DisplayName("without the service-role key it refuses, and signs nothing")
    void noKeyRefuses() {
        links = new FakeLinks("");
        sharedRecord(null, own("receipt.jpg"));

        assertThrows(ReceiptLinksUnavailableException.class,
                () -> service().getReceiptPages(sessionId, recordId, TOKEN));
        assertThat(links.signed).isEmpty();
    }

    @Test
    @DisplayName("a record with no photo needs no key")
    void noPhotoNeedsNoKey() {
        links = new FakeLinks("");
        sharedRecord(null, null);

        assertThat(service().getReceiptPages(sessionId, recordId, TOKEN).pages()).isEmpty();
    }

    @Test
    @DisplayName("a page missing from Storage is left out, not fatal")
    void missingPageIsLeftOut() {
        twoPages(own("page-1.jpg"), own("page-2.jpg"));
        links.missing.add(own("page-2.jpg"));

        MechanicReceiptPagesResponse response = service().getReceiptPages(sessionId, recordId, TOKEN);

        assertThat(response.pages()).extracting(MechanicReceiptPagesResponse.Page::pageNumber).containsExactly(1);
    }

    @Test
    @DisplayName("Storage failing is reported as unavailable")
    void storageFailureRefuses() {
        twoPages(own("page-1.jpg"), own("page-2.jpg"));
        links.failure = new RestClientException("Storage answered 503");

        assertThrows(ReceiptLinksUnavailableException.class,
                () -> service().getReceiptPages(sessionId, recordId, TOKEN));
    }

    @Test
    @DisplayName("unsafe characters in a signed path are escaped, existing escapes are not doubled")
    void escapesUnsafeCharacters() {
        assertThat(MechanicReceiptLinks.escapeUnsafe("/object/sign/b/a b%20c.jpg?token=x.y-z"))
                .isEqualTo("/object/sign/b/a%20b%20c.jpg?token=x.y-z");
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
}
