package com.trevora.api.shared.exception;

/**
 * A confirmed draft was asked to be deleted on its own. Answered 409 with
 * {@link #CODE}.
 *
 * <p>Migration 016 cascades {@code service_records.draft_id} from the draft, so
 * deleting a confirmed draft would silently delete the service record it became:
 * a destructive side effect the caller did not ask for, taking the thing the
 * owner cares about. Deleting the record is its own action, and the message says
 * which one.
 */
public class DraftHasRecordException extends RuntimeException {

    public static final String CODE = "DRAFT_HAS_RECORD";

    public DraftHasRecordException() {
        super("This draft was saved as a service record, so it can't be deleted on its own. "
                + "Delete the record from the vehicle's history instead. "
                + "That removes the draft, its receipt photos and its text with it.");
    }
}
