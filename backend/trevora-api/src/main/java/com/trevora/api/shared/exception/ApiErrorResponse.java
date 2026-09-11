package com.trevora.api.shared.exception;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/**
 * @param code a stable name for errors a page reacts to differently -- a rate
 *             limit, an abuse warning, a suspended account -- so it need not
 *             match on wording. Absent from the JSON when there is none.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiErrorResponse(
        String message,
        int status,
        Instant timestamp,
        String code
) {
    public static ApiErrorResponse of(String message, int status) {
        return new ApiErrorResponse(message, status, Instant.now(), null);
    }

    public static ApiErrorResponse of(String message, int status, String code) {
        return new ApiErrorResponse(message, status, Instant.now(), code);
    }
}
