package com.trevora.api.exception;

import java.time.Instant;

public record ApiErrorResponse(
        String message,
        int status,
        Instant timestamp
) {
    public static ApiErrorResponse of(String message, int status) {
        return new ApiErrorResponse(message, status, Instant.now());
    }
}
