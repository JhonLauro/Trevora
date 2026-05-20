package com.trevora.api.shared.exception;

public class UnauthorizedVehicleAccessException extends RuntimeException {
    public UnauthorizedVehicleAccessException(String message) {
        super(message);
    }
}
