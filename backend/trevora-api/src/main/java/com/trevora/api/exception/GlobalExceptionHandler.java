package com.trevora.api.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
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

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .orElse("Request validation failed.");

        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(message, HttpStatus.BAD_REQUEST.value()));
    }
}
