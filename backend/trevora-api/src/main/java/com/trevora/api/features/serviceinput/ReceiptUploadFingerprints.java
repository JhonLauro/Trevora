package com.trevora.api.features.serviceinput;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * Recognises a receipt upload that has already been paid for.
 *
 * <p>Reading a receipt costs a Google Vision call per page and one or more OpenAI
 * completions. Sending the same photos again -- a double tap, a retry after a slow
 * response, someone hammering the button -- used to pay all of that again for a
 * second identical draft. The pages are fingerprinted instead, and when the same
 * owner uploads the same pages for the same vehicle while the draft they made is
 * still unconfirmed, that draft is opened again for nothing.
 *
 * <p>Only an unconfirmed draft from the last 30 days is reused. Once it is
 * confirmed or deleted, the same photos are read afresh: at that point someone is
 * deliberately starting over.
 *
 * <p>Backed by {@code receipt_upload_fingerprints} (migration 025), through its own
 * transactions for the same reasons as the AI spend ledger: a failed statement must
 * not abort the draft being created. If the table is missing, reuse is simply
 * skipped -- every upload is read, as before -- and the problem is logged at most
 * once a minute.
 */
@Component
public class ReceiptUploadFingerprints {
    private static final Logger log = LoggerFactory.getLogger(ReceiptUploadFingerprints.class);
    private static final long FAILURE_LOG_INTERVAL_MILLIS = 60_000;

    private static final String FIND_REUSABLE = """
            select f.draft_id
            from public.receipt_upload_fingerprints f
            join public.service_drafts d on d.draft_id = f.draft_id
            where f.owner_id = ?
              and f.vehicle_id = ?
              and f.fingerprint = ?
              and d.owner_id = f.owner_id
              and d.vehicle_id = f.vehicle_id
              and d.status <> 'CONFIRMED'
              and f.created_at > now() - interval '30 days'
            order by f.created_at desc
            limit 1
            """;

    private static final String REMEMBER = """
            insert into public.receipt_upload_fingerprints (draft_id, fingerprint, owner_id, vehicle_id)
            values (?, ?, ?, ?)
            on conflict (draft_id) do nothing
            """;

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate ownTransaction;
    private volatile long lastFailureLoggedAt;

    public ReceiptUploadFingerprints(JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager) {
        this.jdbcTemplate = jdbcTemplate;
        if (jdbcTemplate == null || transactionManager == null) {
            this.ownTransaction = null;
        } else {
            TransactionTemplate template = new TransactionTemplate(transactionManager);
            template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            this.ownTransaction = template;
        }
    }

    /** Never finds anything and never stores anything: for code built outside Spring. */
    public static ReceiptUploadFingerprints disabled() {
        return new ReceiptUploadFingerprints(null, null);
    }

    /**
     * A SHA-256 over every page's bytes, in upload order, each prefixed with its
     * length so that pages cannot be re-split into the same stream. The same pages
     * in a different order are a different upload.
     *
     * @return the fingerprint, or null when there are no pages or one cannot be read
     */
    public static String fingerprintOf(List<MultipartFile> pages) {
        if (pages == null || pages.isEmpty()) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(pages.size()).array());
            byte[] buffer = new byte[64 * 1024];
            for (MultipartFile page : pages) {
                if (page == null) {
                    return null;
                }
                digest.update(ByteBuffer.allocate(Long.BYTES).putLong(page.getSize()).array());
                try (InputStream in = page.getInputStream()) {
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        digest.update(buffer, 0, read);
                    }
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (IOException | NoSuchAlgorithmException unreadable) {
            return null;
        }
    }

    /** The unconfirmed draft these exact pages already made, if there is one. */
    public Optional<UUID> reusableDraft(UUID ownerId, UUID vehicleId, String fingerprint) {
        if (jdbcTemplate == null || fingerprint == null || ownerId == null || vehicleId == null) {
            return Optional.empty();
        }
        try {
            List<UUID> found = ownTransaction.execute(status ->
                    jdbcTemplate.queryForList(FIND_REUSABLE, UUID.class, ownerId, vehicleId, fingerprint));
            return found == null || found.isEmpty() ? Optional.empty() : Optional.ofNullable(found.get(0));
        } catch (RuntimeException failure) {
            noteFailure("look up", failure);
            return Optional.empty();
        }
    }

    public void remember(String fingerprint, UUID ownerId, UUID vehicleId, UUID draftId) {
        if (jdbcTemplate == null || fingerprint == null || ownerId == null || vehicleId == null || draftId == null) {
            return;
        }
        try {
            ownTransaction.executeWithoutResult(status ->
                    jdbcTemplate.update(REMEMBER, draftId, fingerprint, ownerId, vehicleId));
        } catch (RuntimeException failure) {
            noteFailure("record", failure);
        }
    }

    private void noteFailure(String action, RuntimeException failure) {
        long now = System.currentTimeMillis();
        if (now - lastFailureLoggedAt < FAILURE_LOG_INTERVAL_MILLIS) {
            return;
        }
        lastFailureLoggedAt = now;
        log.error("Could not {} a receipt upload fingerprint ({}). Duplicate uploads are being read again "
                + "until this works -- has migration 025 been applied?", action, failure.toString());
    }
}
