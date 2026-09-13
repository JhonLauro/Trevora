package com.trevora.api.shared.exception;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;

/**
 * The catch-all used to answer 500 for every one of these, which told a caller
 * their own mistake was a server crash -- and sent anyone reading the logs
 * hunting for a fault that was never there.
 */
class GlobalExceptionHandlerStatusTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    private int statusOf(Exception exception) {
        ResponseEntity<ApiErrorResponse> response = handler.handleUnexpected(exception);
        assertNotNull(response.getBody());
        assertEquals(response.getStatusCode().value(), response.getBody().status(),
                "the body's status must agree with the response's");
        return response.getStatusCode().value();
    }

    @Test
    @DisplayName("a missing request parameter is the caller's 400")
    void missingParameterIsBadRequest() {
        assertEquals(400, statusOf(new MissingServletRequestParameterException("vehicleProfileId", "UUID")));
    }

    @Test
    @DisplayName("an unsupported content type is a 415")
    void wrongContentTypeIsUnsupportedMediaType() {
        assertEquals(415, statusOf(new HttpMediaTypeNotSupportedException(
                MediaType.TEXT_PLAIN, java.util.List.of(MediaType.MULTIPART_FORM_DATA))));
    }

    @Test
    @DisplayName("a wrong HTTP method is a 405")
    void wrongMethodIsMethodNotAllowed() {
        assertEquals(405, statusOf(new HttpRequestMethodNotSupportedException(HttpMethod.PATCH.name())));
    }

    @Test
    @DisplayName("anything that does not describe its own status is still a 500")
    void genuinelyUnexpectedIsStillServerError() {
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR.value(), statusOf(new IllegalStateException("boom")));
    }

    @Test
    @DisplayName("a failure with no message still produces a body")
    void nullMessageStillAnswers() {
        ResponseEntity<ApiErrorResponse> response =
                handler.handleUnexpected(new MissingServletRequestParameterException("q", "String"));

        assertNotNull(response.getBody());
        assertNotNull(response.getBody().message());
    }

    @Test
    @DisplayName("a refused deletion is a 503 with its code, and says nothing was removed")
    void refusedDeletionIsServiceUnavailable() {
        ResponseEntity<ApiErrorResponse> response =
                handler.handleDeletionUnavailable(new DeletionUnavailableException("record"));

        assertEquals(503, response.getStatusCode().value());
        assertEquals(DeletionUnavailableException.CODE, response.getBody().code());
        assertTrue(response.getBody().message().contains("nothing was removed"));
    }

    @Test
    @DisplayName("deleting a confirmed draft is a 409 that names the action to use instead")
    void confirmedDraftIsConflict() {
        ResponseEntity<ApiErrorResponse> response = handler.handleDraftHasRecord(new DraftHasRecordException());

        assertEquals(409, response.getStatusCode().value());
        assertEquals(DraftHasRecordException.CODE, response.getBody().code());
        assertTrue(response.getBody().message().contains("Delete the record"));
    }
}
