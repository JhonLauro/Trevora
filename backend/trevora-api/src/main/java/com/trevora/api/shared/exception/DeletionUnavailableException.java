package com.trevora.api.shared.exception;

/**
 * A deletion was refused because its receipt files could not be removed.
 * Answered 503 with {@link #CODE}.
 *
 * <p>The message is for the owner, and its important half is that nothing was
 * removed: a refusal they mistake for success is the defect this replaces,
 * where rows were deleted and photos quietly left behind.
 */
public class DeletionUnavailableException extends RuntimeException {

    public static final String CODE = "DELETION_UNAVAILABLE";

    /** @param subject what was being deleted, as the owner calls it: "record", "draft", "vehicle", "account" */
    public DeletionUnavailableException(String subject) {
        super("This couldn't be deleted, and nothing was removed. Your " + subject
                + " is still here. Try again later, and if it keeps happening, contact us.");
    }

    private DeletionUnavailableException(String message, boolean verbatim) {
        super(message);
    }

    /** For the rare refusal where "nothing was removed" would not be true. */
    public static DeletionUnavailableException withMessage(String message) {
        return new DeletionUnavailableException(message, true);
    }
}
