package com.trevora.api.shared.exception;

/**
 * A vehicle edit the server will not apply: a NOT NULL column asked to be
 * cleared, a photo pointer sent as half a pair, or a PATCH body naming no
 * field at all.
 *
 * <p>Distinct from bean validation, which answers "is this value acceptable
 * for this field". These are the rules about which combinations of fields make
 * sense together, and they need the request's presence set to state — a null
 * make is only wrong when the caller actually sent one.
 */
public class InvalidVehicleUpdateException extends RuntimeException {
    public InvalidVehicleUpdateException(String message) {
        super(message);
    }
}
