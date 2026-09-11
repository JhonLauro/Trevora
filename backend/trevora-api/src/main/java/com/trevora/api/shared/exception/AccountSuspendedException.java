package com.trevora.api.shared.exception;

/**
 * The signed-in account is suspended. Answered 403 with {@link #CODE}, so the
 * frontend can sign the browser out and show the reason rather than a generic
 * failure.
 */
public class AccountSuspendedException extends RuntimeException {
    public static final String CODE = "ACCOUNT_SUSPENDED";

    public AccountSuspendedException(String message) {
        super(message);
    }
}
