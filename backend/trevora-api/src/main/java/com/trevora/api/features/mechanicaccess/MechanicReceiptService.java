package com.trevora.api.features.mechanicaccess;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;

/**
 * Receipt photos for a mechanic, as short-lived signed links.
 *
 * <p>The links are signed with the service-role key, which ignores the
 * bucket's owner-only policies. So three things are checked before anything
 * is signed, and none of them is anything the mechanic sends:
 * <ol>
 *   <li>the session: token, approval, read-only and expiry, exactly as for the
 *       record itself;</li>
 *   <li>the record: it belongs to the session's vehicle and owner, and the
 *       files are the ones its shared view already names;</li>
 *   <li>the folder: each path starts with the owner's own id. Record metadata
 *       is written from the owner's browser, so without this an owner could
 *       point a record at another account's receipt and share it to themselves.
 *       The owner-only policy draws the same line.</li>
 * </ol>
 *
 * <p>Links last {@link #LINK_LIFETIME}, and never past the session's expiry.
 * A link cannot be recalled once issued, so revoking a session leaves any link
 * already handed out working until it lapses.
 */
@Service
public class MechanicReceiptService {

    private static final Logger log = LoggerFactory.getLogger(MechanicReceiptService.class);

    static final Duration LINK_LIFETIME = Duration.ofMinutes(15);
    static final String DEFAULT_BUCKET = "service-receipts";

    /** One stored page the shared record names. */
    record SharedPage(int pageNumber, String bucket, String path) {
    }

    private final MechanicAccessService mechanicAccessService;
    private final MechanicReceiptLinks links;

    public MechanicReceiptService(MechanicAccessService mechanicAccessService, MechanicReceiptLinks links) {
        this.mechanicAccessService = mechanicAccessService;
        this.links = links;
    }

    /*
     * Not @Transactional: signing is a network call per page, and holding a
     * database connection across it buys nothing. The record is read through
     * getSharedRecord, in its own transaction, so the files are exactly the ones
     * the mechanic's record page is given. The session is read first only for
     * its owner and expiry, which that response does not carry.
     */
    public MechanicReceiptPagesResponse getReceiptPages(UUID sessionId, UUID recordId, String sessionToken) {
        MechanicAccessSession session = mechanicAccessService.requireActiveReadOnlySession(sessionId, sessionToken);
        MechanicSharedRecordDetailResponse detail =
                mechanicAccessService.getSharedRecord(sessionId, recordId, sessionToken);

        List<SharedPage> pages = sharedPages(detail.record());
        if (pages.isEmpty()) {
            return new MechanicReceiptPagesResponse(List.of(), null);
        }
        if (!links.available()) {
            log.error("Receipt photos for record {} cannot be shown to a mechanic: SUPABASE_URL or "
                    + "SUPABASE_SERVICE_ROLE_KEY is not set.", recordId);
            throw new ReceiptLinksUnavailableException();
        }

        Instant now = Instant.now();
        Instant expiresAt = now.plus(LINK_LIFETIME);
        if (session.getExpiresAt().isBefore(expiresAt)) {
            expiresAt = session.getExpiresAt();
        }
        long seconds = Math.max(1, Duration.between(now, expiresAt).getSeconds());

        List<MechanicReceiptPagesResponse.Page> signed = new ArrayList<>();
        for (SharedPage page : pages) {
            if (!inOwnerFolder(page.path(), session.getOwnerId())) {
                log.warn("Refused to sign page {} of record {} for a mechanic: its path is outside the owner's folder.",
                        page.pageNumber(), recordId);
                continue;
            }
            String url;
            try {
                url = links.sign(page.bucket(), page.path(), seconds);
            } catch (RestClientException failure) {
                log.error("Storage did not sign page {} of record {} for a mechanic ({}).",
                        page.pageNumber(), recordId, failure.getMessage());
                throw new ReceiptLinksUnavailableException();
            }
            if (url == null) {
                log.warn("Page {} of record {} is not in Storage; left out of the mechanic's view.",
                        page.pageNumber(), recordId);
                continue;
            }
            signed.add(new MechanicReceiptPagesResponse.Page(page.pageNumber(), url));
        }
        return new MechanicReceiptPagesResponse(signed, expiresAt);
    }

    /**
     * The pages the mechanic's record view shows, read the way the frontend's
     * receipt preview reads them: the stored page list when there is one,
     * otherwise the single receipt path.
     */
    static List<SharedPage> sharedPages(MechanicSharedServiceRecordResponse record) {
        List<SharedPage> pages = new ArrayList<>();
        Map<String, Object> metadata = record.fieldMetadata();
        Object stored = metadata == null ? null : metadata.get("storedReceiptPages");

        if (stored instanceof List<?> list && !list.isEmpty()) {
            int position = 0;
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> page)) {
                    continue;
                }
                String path = text(page.get("path"));
                if (path == null) {
                    continue;
                }
                position++;
                int pageNumber = page.get("pageNumber") instanceof Number number ? number.intValue() : position;
                String bucket = firstPresent(text(page.get("bucket")), record.receiptStorageBucket());
                pages.add(new SharedPage(pageNumber, bucket, path));
            }
            return pages;
        }

        String path = text(record.receiptStoragePath());
        if (path != null) {
            pages.add(new SharedPage(1, firstPresent(record.receiptStorageBucket(), null), path));
        }
        return pages;
    }

    /**
     * True only for "ownerId/..." with no empty, "." or ".." segment. A ".."
     * could otherwise pass the prefix and climb into another account's folder
     * once the URL is normalised.
     */
    static boolean inOwnerFolder(String path, UUID ownerId) {
        if (path == null || ownerId == null || path.indexOf('\\') >= 0) {
            return false;
        }
        String[] segments = path.split("/", -1);
        if (segments.length < 2 || !segments[0].equalsIgnoreCase(ownerId.toString())) {
            return false;
        }
        for (String segment : segments) {
            if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) {
                return false;
            }
        }
        return true;
    }

    private static String firstPresent(String primary, String fallback) {
        String chosen = text(primary) != null ? text(primary) : text(fallback);
        return chosen == null ? DEFAULT_BUCKET : chosen;
    }

    private static String text(Object value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.toString().trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
