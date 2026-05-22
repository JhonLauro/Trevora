package com.trevora.api.features.serviceinput;

public record VoiceTranscriptionResponse(
        String transcript,
        String sourceTranscript,
        String provider,
        String model,
        boolean translatedToEnglish
) {
}
