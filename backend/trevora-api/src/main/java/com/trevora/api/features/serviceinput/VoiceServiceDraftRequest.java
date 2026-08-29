package com.trevora.api.features.serviceinput;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * The cap sits well above the 8000 characters the extraction path reads, on
 * purpose. Going over that is not an error here -- the transcript is truncated
 * and the draft carries a warning saying what was not read, which is better
 * than refusing a long recording outright. This only stops a payload that was
 * never a transcript.
 */
public record VoiceServiceDraftRequest(
        @NotNull UUID vehicleId,
        @NotBlank
        @Size(max = 50000, message = "That transcript is too long. Keep it under 50000 characters.")
        String transcript
) {
}
