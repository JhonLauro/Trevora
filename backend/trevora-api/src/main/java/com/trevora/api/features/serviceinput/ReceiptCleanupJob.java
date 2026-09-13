package com.trevora.api.features.serviceinput;

import com.trevora.api.shared.exception.DeletionUnavailableException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * One-off cleanup of receipt data left behind by deletions made before
 * deletion destroyed receipt files (2026-09-13).
 *
 * <p>Two kinds of leftover, sized on 2026-09-14 before any of this ran: 6
 * confirmed drafts whose record had been deleted (each still holding the
 * receipt transcript and photo paths), and 120 photos in {@code service-receipts}
 * that no draft or record references.
 *
 * <p><b>Off unless asked, and a report before it deletes.</b> Runs once at boot,
 * only when {@code TREVORA_RECEIPT_CLEANUP} is set: {@code dry-run} logs what it
 * would remove and removes nothing; {@code delete} removes it. Any other value
 * is refused. Running it again is harmless -- what it removed is no longer
 * there to find. Unset the variable afterwards.
 *
 * <p><b>The report names no files.</b> Object paths contain account ids and the
 * uploaded filename, which can be a person's name. Logging them would copy
 * personal data into the hosting provider's logs, so the report gives counts,
 * ages and how many accounts are affected.
 *
 * <p><b>Same order as every delete path.</b> An orphaned draft's photos go
 * first through {@link ReceiptFiles}, then its fingerprint and row. Unreferenced
 * photos must be older than 24 hours, because an upload stores its pages before
 * its draft exists; a fresh photo with no draft yet is not an orphan.
 */
@Component
public class ReceiptCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(ReceiptCleanupJob.class);
    private static final int BATCH = 100;

    static final String ORPHAN_DRAFTS = """
            select d.draft_id from public.service_drafts d
            where d.status = 'CONFIRMED'
              and not exists (select 1 from public.service_records r where r.draft_id = d.draft_id)
            """;

    static final String UNREFERENCED_OBJECTS = """
            select o.name, o.created_at from storage.objects o
            where o.bucket_id = 'service-receipts'
              and o.created_at < now() - interval '24 hours'
              and not exists (select 1 from public.service_drafts d
                              where d.receipt_storage_path = o.name
                                 or d.field_metadata->'storedReceiptPages'
                                    @> jsonb_build_array(jsonb_build_object('path', o.name)))
              and not exists (select 1 from public.service_records r
                              where r.receipt_storage_path = o.name
                                 or r.field_metadata->'storedReceiptPages'
                                    @> jsonb_build_array(jsonb_build_object('path', o.name)))
            order by o.created_at
            """;

    enum Mode { OFF, DRY_RUN, DELETE, INVALID }

    /** A stored object nothing points to: its path and when it was uploaded. */
    record UnreferencedObject(String path, Instant createdAt) {
    }

    private final Mode mode;
    private final JdbcTemplate jdbcTemplate;
    private final ServiceDraftRepository serviceDraftRepository;
    private final ReceiptFiles receiptFiles;
    private final ReceiptUploadFingerprints receiptUploadFingerprints;
    private final TransactionTemplate transaction;

    public ReceiptCleanupJob(
            @Value("${trevora.receipt-cleanup.mode:}") String mode,
            JdbcTemplate jdbcTemplate,
            ServiceDraftRepository serviceDraftRepository,
            ReceiptFiles receiptFiles,
            ReceiptUploadFingerprints receiptUploadFingerprints,
            PlatformTransactionManager transactionManager
    ) {
        this.mode = parse(mode);
        this.jdbcTemplate = jdbcTemplate;
        this.serviceDraftRepository = serviceDraftRepository;
        this.receiptFiles = receiptFiles;
        this.receiptUploadFingerprints = receiptUploadFingerprints;
        this.transaction = transactionManager == null ? null : new TransactionTemplate(transactionManager);
    }

    static Mode parse(String value) {
        if (value == null || value.isBlank()) {
            return Mode.OFF;
        }
        return switch (value.trim().toLowerCase(Locale.ROOT)) {
            case "dry-run" -> Mode.DRY_RUN;
            case "delete" -> Mode.DELETE;
            default -> Mode.INVALID;
        };
    }

    @EventListener(ApplicationReadyEvent.class)
    public void runAtStartup() {
        run();
    }

    void run() {
        if (mode == Mode.OFF) {
            return;
        }
        if (mode == Mode.INVALID) {
            log.error("Receipt cleanup refused: TREVORA_RECEIPT_CLEANUP must be 'dry-run' or 'delete'. Nothing was read or removed.");
            return;
        }
        boolean delete = mode == Mode.DELETE;
        log.warn("Receipt cleanup starting in {} mode.", delete ? "DELETE" : "DRY-RUN");
        try {
            cleanOrphanDrafts(delete);
            cleanUnreferencedObjects(delete);
        } catch (DeletionUnavailableException refused) {
            // ReceiptFiles has already logged the cause as an error.
            log.error("Receipt cleanup stopped: receipt files could not be removed. What was done before this is done; "
                    + "running it again continues from here.");
        } catch (RuntimeException failure) {
            log.error("Receipt cleanup stopped: {}. Running it again continues from here.", failure.toString());
        }
    }

    private void cleanOrphanDrafts(boolean delete) {
        List<UUID> ids = orphanDraftIds();
        List<ServiceDraft> drafts = ids.isEmpty() ? List.of() : serviceDraftRepository.findAllById(ids);
        Set<ReceiptFiles.StoredReceipt> files = new LinkedHashSet<>();
        Set<UUID> owners = new LinkedHashSet<>();
        drafts.forEach(draft -> {
            files.addAll(ReceiptFiles.of(draft));
            owners.add(draft.getOwnerId());
        });
        log.warn("Receipt cleanup: {} confirmed draft(s) with no record, across {} account(s), holding {} stored file(s).",
                drafts.size(), owners.size(), files.size());
        if (!delete) {
            return;
        }
        int removed = 0;
        for (ServiceDraft draft : drafts) {
            receiptFiles.removeOrRefuse(ReceiptFiles.of(draft), "draft", "orphaned draft " + draft.getDraftId());
            transaction.executeWithoutResult(status -> {
                receiptUploadFingerprints.forget(draft.getDraftId());
                serviceDraftRepository.delete(draft);
            });
            removed++;
        }
        log.warn("Receipt cleanup: deleted {} orphaned draft(s) and their files.", removed);
    }

    private void cleanUnreferencedObjects(boolean delete) {
        List<UnreferencedObject> objects = unreferencedObjects();
        Set<String> owners = new LinkedHashSet<>();
        objects.forEach(object -> owners.add(object.path().split("/", 2)[0]));
        log.warn("Receipt cleanup: {} unreferenced photo(s) older than 24 hours, across {} account folder(s), uploaded {} to {}.",
                objects.size(), owners.size(),
                objects.isEmpty() ? "-" : objects.get(0).createdAt(),
                objects.isEmpty() ? "-" : objects.get(objects.size() - 1).createdAt());
        if (!delete) {
            return;
        }
        int removed = 0;
        for (int start = 0; start < objects.size(); start += BATCH) {
            List<UnreferencedObject> batch = objects.subList(start, Math.min(start + BATCH, objects.size()));
            List<ReceiptFiles.StoredReceipt> files = new ArrayList<>();
            batch.forEach(object -> files.add(new ReceiptFiles.StoredReceipt(ReceiptFiles.DEFAULT_BUCKET, object.path())));
            receiptFiles.removeOrRefuse(files, "photos", "unreferenced photos batch starting at " + start);
            removed += batch.size();
        }
        log.warn("Receipt cleanup: removed {} unreferenced photo(s).", removed);
    }

    List<UUID> orphanDraftIds() {
        return jdbcTemplate.queryForList(ORPHAN_DRAFTS, UUID.class);
    }

    List<UnreferencedObject> unreferencedObjects() {
        return jdbcTemplate.query(UNREFERENCED_OBJECTS, (row, index) -> {
            Timestamp created = row.getTimestamp("created_at");
            return new UnreferencedObject(row.getString("name"), created == null ? null : created.toInstant());
        });
    }
}
