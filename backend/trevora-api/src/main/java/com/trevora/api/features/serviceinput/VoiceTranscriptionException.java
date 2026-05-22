package com.trevora.api.features.serviceinput;

public class VoiceTranscriptionException extends RuntimeException {
    public VoiceTranscriptionException(String message) {
        super(message);
    }

    public VoiceTranscriptionException(String message, Throwable cause) {
        super(message, cause);
    }
}
