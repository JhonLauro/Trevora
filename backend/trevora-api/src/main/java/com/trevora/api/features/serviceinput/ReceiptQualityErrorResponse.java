package com.trevora.api.features.serviceinput;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/**
 * A quality refusal as the browser receives it: the usual message, status and
 * code, plus which pages failed and why, so the receipt screen can mark each one.
 *
 * <p>Its own record rather than a field on the shared {@code ApiErrorResponse},
 * which every error in the API returns and nothing else needs to change for.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReceiptQualityErrorResponse(
        String message,
        int status,
        Instant timestamp,
        String code,
        List<Page> pages
) {
    public record Page(int pageNumber, String issue, String code) {
    }

    public static ReceiptQualityErrorResponse from(ReceiptQualityException exception, int status) {
        return new ReceiptQualityErrorResponse(
                exception.getMessage(),
                status,
                Instant.now(),
                exception.code(),
                exception.pages().stream()
                        .map(page -> new Page(page.pageNumber(), page.issue().name(), page.issue().code()))
                        .toList()
        );
    }
}
