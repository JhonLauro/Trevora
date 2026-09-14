package com.trevora.api.features.mechanicaccess;

import java.time.Instant;
import java.util.List;

/**
 * Signed links to a shared record's receipt photos, in page order.
 *
 * @param expiresAt when the links stop working; never later than the session.
 *     Null when the record has no photos.
 */
public record MechanicReceiptPagesResponse(List<Page> pages, Instant expiresAt) {

    public record Page(int pageNumber, String url) {
    }
}
