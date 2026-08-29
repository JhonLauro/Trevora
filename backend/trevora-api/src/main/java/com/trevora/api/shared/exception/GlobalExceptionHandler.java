package com.trevora.api.shared.exception;

import com.trevora.api.features.serviceinput.ReceiptUploadException;
import com.trevora.api.features.serviceinput.VoiceTranscriptionException;
import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNotFound(ResourceNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiErrorResponse.of(exception.getMessage(), HttpStatus.NOT_FOUND.value()));
    }

    @ExceptionHandler(UnauthorizedVehicleAccessException.class)
    public ResponseEntity<ApiErrorResponse> handleUnauthorizedVehicle(UnauthorizedVehicleAccessException exception) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiErrorResponse.of(exception.getMessage(), HttpStatus.FORBIDDEN.value()));
    }

    @ExceptionHandler(InvalidServiceRecordConfirmationException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalidConfirmation(InvalidServiceRecordConfirmationException exception) {
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(exception.getMessage(), HttpStatus.BAD_REQUEST.value()));
    }

    @ExceptionHandler(AuthException.class)
    public ResponseEntity<ApiErrorResponse> handleAuth(AuthException exception) {
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(exception.getMessage(), HttpStatus.BAD_REQUEST.value()));
    }

    @ExceptionHandler(AccessRequestException.class)
    public ResponseEntity<ApiErrorResponse> handleAccessRequest(AccessRequestException exception) {
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(exception.getMessage(), HttpStatus.BAD_REQUEST.value()));
    }

    @ExceptionHandler(VoiceTranscriptionException.class)
    public ResponseEntity<ApiErrorResponse> handleVoiceTranscription(VoiceTranscriptionException exception) {
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(exception.getMessage(), HttpStatus.BAD_REQUEST.value()));
    }

    @ExceptionHandler(ReceiptUploadException.class)
    public ResponseEntity<ApiErrorResponse> handleReceiptUpload(ReceiptUploadException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiErrorResponse.of(exception.getMessage(), HttpStatus.BAD_REQUEST.value()));
    }

    /**
     * Raised by the servlet container before any controller runs, so the size
     * message the feature would have given never gets a chance. Without this it
     * answers 500 and an upload that is merely too big looks like a crash.
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiErrorResponse> handleUploadTooLarge(MaxUploadSizeExceededException exception) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(ApiErrorResponse.of(
                        "That upload is too large. Send fewer or smaller files.",
                        HttpStatus.PAYLOAD_TOO_LARGE.value()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .orElse("Request validation failed.");

        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(message, HttpStatus.BAD_REQUEST.value()));
    }

    /**
     * Raised by @Validated on a controller when a request parameter fails its
     * own constraint -- a search question over the length cap, say. Without
     * this it falls through to the catch-all below and a rejected input is
     * reported as a server fault.
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleConstraintViolation(ConstraintViolationException exception) {
        String message = exception.getConstraintViolations().stream()
                .findFirst()
                .map(violation -> violation.getMessage())
                .orElse("Request is not valid.");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiErrorResponse.of(message, HttpStatus.BAD_REQUEST.value()));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        String message = exception.getName() + " has an invalid value.";

        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(message, HttpStatus.BAD_REQUEST.value()));
    }

    /**
     * Last resort. Spring's own request-handling failures already carry the
     * right status -- a wrong Content-Type is a 415, a missing parameter a 400
     * -- and they reach this method because it catches everything. Answering
     * them 500 told the caller their mistake was our crash, and sent anyone
     * debugging it looking for a server fault that was never there.
     *
     * <p>Anything that does not describe its own status is still a 500, which
     * is what this method is really for.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception exception) {
        if (exception instanceof ErrorResponse errorResponse) {
            HttpStatusCode status = errorResponse.getStatusCode();
            return ResponseEntity.status(status)
                    .body(ApiErrorResponse.of(messageFor(exception), status.value()));
        }
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiErrorResponse.of(exception.getMessage(), HttpStatus.INTERNAL_SERVER_ERROR.value()));
    }

    private String messageFor(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "Request could not be handled." : message;
    }
}
