package com.trevora.api.features.auth;

import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.shared.exception.AccessRequestException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Permanently deletes the signed-in owner's account.
 *
 * <p><b>How the deletion actually happens.</b> Only one row is deleted here:
 * the Supabase auth user. Migration 016 declared
 * {@code public.users.user_id -> auth.users.id ON DELETE CASCADE} and cascaded
 * the whole ownership tree beneath {@code users}, so removing that single row
 * takes the profile, the vehicles, the drafts, the confirmed records, their
 * line items, the share links, the access requests and the mechanic sessions
 * with it. There is no delete loop in this class because the database already
 * knows the shape of the tree, and a hand-written loop would only be a second,
 * staler copy of it.
 *
 * <p><b>Mechanics are not deleted, and that is deliberate.</b> Mechanics never
 * register — {@code mechanic_id} is null on every row today, and 016 gave those
 * two columns ON DELETE SET NULL rather than CASCADE. Deleting an owner removes
 * the sessions they granted, which is what "the mechanics connected to that
 * account" actually means here; it does not reach into anyone else's data.
 *
 * <p><b>Why this refuses to run without a service-role key.</b> Deleting an
 * auth user and deleting storage objects are both admin operations, and the
 * anon key can do neither. Without the key the most this could manage is
 * emptying the app tables while leaving the Google login working and the
 * receipt images sitting in the bucket — the signed-in owner would appear to
 * have deleted their account, then sign back in to a working, empty one. That
 * half-state is the exact problem migration 016 was written to end, so it is
 * refused rather than reproduced.
 */
@Service
public class AccountDeletionService {
    private static final Logger log = LoggerFactory.getLogger(AccountDeletionService.class);
    private static final String DEFAULT_RECEIPT_BUCKET = "service-receipts";

    private final CurrentUserService currentUserService;
    private final ServiceRecordRepository serviceRecordRepository;
    private final ServiceDraftRepository serviceDraftRepository;
    private final String supabaseUrl;
    private final String serviceRoleKey;

    // Built on first use: constructing a client eagerly opens a socket in every
    // deployment, including the ones where nobody ever deletes an account.
    private RestClient restClient;

    public AccountDeletionService(
            CurrentUserService currentUserService,
            ServiceRecordRepository serviceRecordRepository,
            ServiceDraftRepository serviceDraftRepository,
            @Value("${supabase.url:}") String supabaseUrl,
            @Value("${supabase.service-role-key:}") String serviceRoleKey
    ) {
        this.currentUserService = currentUserService;
        this.serviceRecordRepository = serviceRecordRepository;
        this.serviceDraftRepository = serviceDraftRepository;
        this.supabaseUrl = trimTrailingSlash(blankToNull(supabaseUrl));
        this.serviceRoleKey = blankToNull(serviceRoleKey);
    }

    @Transactional(readOnly = true)
    public AccountDeletionResponse deleteCurrentAccount() {
        if (supabaseUrl == null || serviceRoleKey == null) {
            throw new AccessRequestException(
                    "Account deletion is not configured on this server. "
                            + "SUPABASE_SERVICE_ROLE_KEY must be set before an account can be removed.");
        }

        UUID userId = currentUserService.getCurrentUserId();

        /*
         * Read the receipt paths before anything is destroyed. After the auth
         * user goes, the rows that name these files are gone too, and the
         * objects would be unreachable rather than merely orphaned.
         */
        List<StoredObject> receipts = collectReceiptObjects(userId);

        /*
         * Order matters. The auth user is deleted first because that is the
         * step that can fail on the server's side, and a failure here must
         * leave the account untouched rather than half-erased. Storage is
         * cleaned afterwards: if that fails, the account is properly gone and
         * what remains is unreferenced bytes in a bucket, which is a problem
         * someone can fix later without the owner's data being in limbo.
         */
        deleteAuthUser(userId);

        int receiptsDeleted = deleteReceiptObjects(receipts);

        log.info("Deleted account {} and {} of {} stored receipt objects.",
                userId, receiptsDeleted, receipts.size());

        return new AccountDeletionResponse(
                userId,
                receipts.size(),
                receiptsDeleted,
                receiptsDeleted == receipts.size()
        );
    }

    // ------------------------------------------------------------ receipts

    /**
     * Every storage object this owner put in the bucket.
     *
     * <p>A record carries a single {@code receiptStoragePath}, but a multi-page
     * receipt also records each page under {@code fieldMetadata.storedReceiptPages}.
     * Collecting only the first would leave every page after page one behind,
     * so both are read. Drafts are included because an unconfirmed draft has
     * usually already uploaded its image.
     */
    private List<StoredObject> collectReceiptObjects(UUID ownerId) {
        Set<StoredObject> objects = new LinkedHashSet<>();

        for (ServiceRecord record : serviceRecordRepository.findByOwnerId(ownerId, Sort.unsorted())) {
            addObject(objects, record.getReceiptStorageBucket(), record.getReceiptStoragePath());
            addPagesFromMetadata(objects, record.getFieldMetadata());
        }

        for (ServiceDraft draft : serviceDraftRepository.findByOwnerId(ownerId)) {
            addObject(objects, draft.getReceiptStorageBucket(), draft.getReceiptStoragePath());
            addPagesFromMetadata(objects, draft.getFieldMetadata());
        }

        return new ArrayList<>(objects);
    }

    @SuppressWarnings("unchecked")
    private void addPagesFromMetadata(Set<StoredObject> objects, Map<String, Object> metadata) {
        Object pages = metadata == null ? null : metadata.get("storedReceiptPages");
        if (!(pages instanceof Iterable<?> iterable)) {
            return;
        }
        for (Object page : iterable) {
            if (page instanceof Map<?, ?> map) {
                Object bucket = ((Map<String, Object>) map).get("bucket");
                Object path = ((Map<String, Object>) map).get("path");
                addObject(objects, bucket == null ? null : bucket.toString(),
                        path == null ? null : path.toString());
            }
        }
    }

    private void addObject(Set<StoredObject> objects, String bucket, String path) {
        String cleanPath = blankToNull(path);
        if (cleanPath == null) {
            return;
        }
        String cleanBucket = blankToNull(bucket);
        objects.add(new StoredObject(cleanBucket == null ? DEFAULT_RECEIPT_BUCKET : cleanBucket, cleanPath));
    }

    /**
     * Storage has no cascade, so the files are removed explicitly, one request
     * per bucket. Failures are logged rather than thrown: by this point the
     * account is already gone, and reporting the deletion as failed would be
     * inaccurate and would invite the owner to try again on an account that no
     * longer exists.
     */
    private int deleteReceiptObjects(List<StoredObject> objects) {
        if (objects.isEmpty()) {
            return 0;
        }

        Map<String, List<String>> pathsByBucket = new LinkedHashMap<>();
        for (StoredObject object : objects) {
            pathsByBucket.computeIfAbsent(object.bucket(), key -> new ArrayList<>()).add(object.path());
        }

        int deleted = 0;
        for (Map.Entry<String, List<String>> entry : pathsByBucket.entrySet()) {
            try {
                restClient().method(org.springframework.http.HttpMethod.DELETE)
                        .uri(supabaseUrl + "/storage/v1/object/" + entry.getKey())
                        .header("apikey", serviceRoleKey)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceRoleKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("prefixes", entry.getValue()))
                        .retrieve()
                        .toBodilessEntity();
                deleted += entry.getValue().size();
            } catch (RestClientException exception) {
                log.warn("Could not delete {} receipt object(s) from bucket {}: {}",
                        entry.getValue().size(), entry.getKey(), exception.getMessage());
            }
        }
        return deleted;
    }

    // ---------------------------------------------------------- auth user

    private void deleteAuthUser(UUID userId) {
        try {
            restClient().method(org.springframework.http.HttpMethod.DELETE)
                    .uri(supabaseUrl + "/auth/v1/admin/users/" + userId)
                    .header("apikey", serviceRoleKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceRoleKey)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            /*
             * Nothing has been destroyed at this point, so this is a clean
             * failure: the owner still has their account and can try again.
             */
            log.error("Supabase rejected the account deletion for {}: {}", userId, exception.getMessage());
            throw new AccessRequestException(
                    "The account could not be deleted. Nothing was removed — please try again.");
        }
    }

    private RestClient restClient() {
        RestClient existing = this.restClient;
        if (existing == null) {
            existing = RestClient.create();
            this.restClient = existing;
        }
        return existing;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String trimTrailingSlash(String value) {
        if (value == null) {
            return null;
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private record StoredObject(String bucket, String path) {
    }
}
