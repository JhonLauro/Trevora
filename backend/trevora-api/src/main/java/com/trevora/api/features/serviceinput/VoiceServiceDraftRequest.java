package com.trevora.api.features.serviceinput;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record VoiceServiceDraftRequest(
        @NotNull UUID vehicleId,
        @NotBlank String transcript
) {
}
