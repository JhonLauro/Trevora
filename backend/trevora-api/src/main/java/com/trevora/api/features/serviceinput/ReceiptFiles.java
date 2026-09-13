package com.trevora.api.features.serviceinput;

import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.shared.exception.DeletionUnavailableException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * The receipt photos a draft or record owns, and their removal from Supabase
 * Storage when the draft, record, vehicle or account is deleted.
 *
 * <p><b>Deletion destroys.</b> Decided 2026-09-13: deleting something removes
 * its rows, its receipt photos and the text read from them, rather than keeping
 * an anonymised copy. A transcript with the shop, date, plate, VIN and amounts
 * identifies its owner with the name removed. Storage has no cascade, so every
 * delete path collects the files here and removes them explicitly.
 *
 * <p><b>Files first, then rows.</b> The database and Storage cannot share a
 * transaction, so the order decides which failure is possible. Removing files
 * first means a Storage failure deletes nothing; the only leftover a later
 * database failure can leave is a row whose photos are already gone, and trying
 * again finishes it. The reverse order is how receipt photos were orphaned
 * before this class existed.
 *
 * <p><b>Refuse rather than half-delete.</b> Without the service-role key the
 * files cannot be removed, so {@link #removeOrRefuse} throws and logs an error
 * instead of letting the caller delete rows and leave photos behind looking
 * like a completed deletion. Something with no stored files needs no key.
 */
@Component
public class ReceiptFiles {

    private static final Logger log = LoggerFactory.getLogger(ReceiptFiles.class);
    static final String DEFAULT_BUCKET = "service-receipts";

    /** One stored object: its bucket and its path within it. */
    public record StoredReceipt(String bucket, String path) {
    }

    private final String supabaseUrl;
    private final String serviceRoleKey;
    // Built on first use, so a deployment where nothing is ever deleted opens no client.
    private RestClient restClient;

    public ReceiptFiles(
            @Value("${supabase.url:}") String supabaseUrl,
            @Value("${supabase.service-role-key:}") String serviceRoleKey
    ) {
        this.supabaseUrl = trimTrailingSlash(blankToNull(supabaseUrl));
        this.serviceRoleKey = blankToNull(serviceRoleKey);
    }

    /** Whether stored files can be removed at all on this server. */
    public boolean available() {
        return supabaseUrl != null && serviceRoleKey != null;
    }

    /**
     * Every file a draft points at: its main path, and each page of a multi-page
     * receipt under {@code fieldMetadata.storedReceiptPages}. Reading only the
     * main path would leave every page after the first behind.
     */
    public static Set<StoredReceipt> of(ServiceDraft draft) {
        Set<StoredReceipt> files = new LinkedHashSet<>();
        if (draft != null) {
            add(files, draft.getReceiptStorageBucket(), draft.getReceiptStoragePath());
            addPages(files, draft.getFieldMetadata());
        }
        return files;
    }

    /** Every file a confirmed record points at, read the same way as a draft's. */
    public static Set<StoredReceipt> of(ServiceRecord record) {
        Set<StoredReceipt> files = new LinkedHashSet<>();
        if (record != null) {
            add(files, record.getReceiptStorageBucket(), record.getReceiptStoragePath());
            addPages(files, record.getFieldMetadata());
        }
        return files;
    }

    /**
     * Removes the files, or throws without having deleted any rows.
     *
     * @param subject what the owner is deleting, for the message they see ("record")
     * @param logLabel what the log names, with its id ("record 1234")
     * @throws DeletionUnavailableException when the key is missing or Storage refuses;
     *     logged as an error, because a user's deletion was just refused
     */
    public void removeOrRefuse(Collection<StoredReceipt> files, String subject, String logLabel) {
        if (files == null || files.isEmpty()) {
            return;
        }
        if (!available()) {
            log.error("Deletion refused for {}: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set, so its {} "
                    + "receipt file(s) cannot be removed. Nothing was deleted.", logLabel, files.size());
            throw new DeletionUnavailableException(subject);
        }

        Map<String, List<String>> pathsByBucket = new LinkedHashMap<>();
        for (StoredReceipt file : files) {
            pathsByBucket.computeIfAbsent(file.bucket(), key -> new ArrayList<>()).add(file.path());
        }
        for (Map.Entry<String, List<String>> entry : pathsByBucket.entrySet()) {
            try {
                send(entry.getKey(), entry.getValue());
            } catch (RestClientException failure) {
                log.error("Deletion refused for {}: Supabase Storage did not remove {} file(s) from bucket {} ({}). "
                                + "No rows were deleted; trying again finishes it.",
                        logLabel, entry.getValue().size(), entry.getKey(), failure.getMessage());
                throw new DeletionUnavailableException(subject);
            }
        }
    }

    /**
     * One Storage request per bucket. A path that is already gone is not an
     * error to Storage, which is what makes a retry after a partial failure safe.
     */
    protected void send(String bucket, List<String> paths) {
        client().method(HttpMethod.DELETE)
                .uri(supabaseUrl + "/storage/v1/object/" + bucket)
                .header("apikey", serviceRoleKey)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceRoleKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("prefixes", paths))
                .retrieve()
                .toBodilessEntity();
    }

    @SuppressWarnings("unchecked")
    private static void addPages(Set<StoredReceipt> files, Map<String, Object> metadata) {
        Object pages = metadata == null ? null : metadata.get("storedReceiptPages");
        if (!(pages instanceof Iterable<?> iterable)) {
            return;
        }
        for (Object page : iterable) {
            if (page instanceof Map<?, ?> map) {
                Object bucket = ((Map<String, Object>) map).get("bucket");
                Object path = ((Map<String, Object>) map).get("path");
                add(files, bucket == null ? null : bucket.toString(), path == null ? null : path.toString());
            }
        }
    }

    private static void add(Set<StoredReceipt> files, String bucket, String path) {
        String cleanPath = blankToNull(path);
        if (cleanPath == null) {
            return;
        }
        String cleanBucket = blankToNull(bucket);
        files.add(new StoredReceipt(cleanBucket == null ? DEFAULT_BUCKET : cleanBucket, cleanPath));
    }

    private RestClient client() {
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
}
