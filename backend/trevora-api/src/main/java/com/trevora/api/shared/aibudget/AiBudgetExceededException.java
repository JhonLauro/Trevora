package com.trevora.api.shared.aibudget;

/**
 * A paid AI call was refused because the day's or the month's AI budget is spent.
 * Answered with 503 and the message as written: it is addressed to the owner.
 */
public class AiBudgetExceededException extends RuntimeException {
    public AiBudgetExceededException(String message) {
        super(message);
    }
}
