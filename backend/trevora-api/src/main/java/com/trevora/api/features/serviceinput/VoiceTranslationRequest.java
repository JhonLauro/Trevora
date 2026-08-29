package com.trevora.api.features.serviceinput;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * Unlike the draft path, nothing downstream truncates this: the transcript goes
 * into a gpt-4o prompt as it arrives, and we pay by the token. The cap matches
 * the ceiling the extraction path already applies to a voice transcript, so
 * nothing rejected here would have been usable anyway.
 */
public record VoiceTranslationRequest(
        @NotNull UUID vehicleId,
        @NotBlank
        @Size(max = 8000, message = "That transcript is too long to translate. Keep it under 8000 characters.")
        String transcript
) {
}
