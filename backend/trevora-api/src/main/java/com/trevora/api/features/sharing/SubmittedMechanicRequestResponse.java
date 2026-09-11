package com.trevora.api.features.sharing;

/**
 * What the mechanic who sent a request gets back.
 *
 * <p>{@code followToken} replaces the code they scanned. Sending a request
 * rotates the link's token, so the QR on paper or on the owner's screen stops
 * working, and this device is the only one able to follow the owner's answer --
 * including receiving the session once the request is approved.
 */
public record SubmittedMechanicRequestResponse(
        MechanicAccessRequestResponse request,
        String followToken
) {
}
