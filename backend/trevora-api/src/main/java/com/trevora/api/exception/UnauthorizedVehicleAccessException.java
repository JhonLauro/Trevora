package com.trevora.api.exception;

public class UnauthorizedVehicleAccessException extends RuntimeException {
    public UnauthorizedVehicleAccessException(String message) {
        super(message);
    }
}
