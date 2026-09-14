package com.trevora.api.features.mechanicaccess;

/**
 * A mechanic's receipt photos could not be signed: the service-role key is
 * missing, or Storage refused or could not be reached. Answered 503 with
 * {@link #CODE}. The rest of the record is unaffected, and the message says so.
 */
public class ReceiptLinksUnavailableException extends RuntimeException {

    public static final String CODE = "RECEIPT_PHOTO_UNAVAILABLE";

    public ReceiptLinksUnavailableException() {
        super("The receipt photo can't be shown right now. The rest of this record is still here.");
    }
}
