package com.trevora.api.features.serviceinput;

public record VoiceTranscriptionResponse(
        String transcript,
        String provider,
        String model
) {
}
