package com.trevora.api.service;

import com.trevora.api.dto.MockVoiceExtraction;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class VoiceProcessingService {
    public MockVoiceExtraction extractServiceFields(String transcript) {
        String cleanedTranscript = transcript.trim();
        String lowerTranscript = cleanedTranscript.toLowerCase(Locale.ROOT);

        String serviceType = inferServiceType(lowerTranscript);

        return new MockVoiceExtraction(
                LocalDate.now(),
                serviceType,
                null,
                BigDecimal.valueOf(1200.00),
                null,
                null,
                inferPartsReplaced(lowerTranscript),
                cleanedTranscript,
                "Mock voice extraction for MVP. Replace VoiceProcessingService with real speech-to-text and mapping later.",
                Map.of(
                        "inputMethod", "VOICE",
                        "source", "mock_voice_transcription",
                        "transcript", cleanedTranscript,
                        "confidence", Map.of(
                                "serviceDate", 0.70,
                                "serviceType", 0.72,
                                "totalCost", 0.64,
                                "laborPerformed", 0.80
                        )
                )
        );
    }

    private String inferServiceType(String transcript) {
        if (transcript.contains("brake")) {
            return "Brake service";
        }
        if (transcript.contains("oil")) {
            return "Oil change";
        }
        if (transcript.contains("battery")) {
            return "Battery service";
        }
        if (transcript.contains("tire") || transcript.contains("tyre")) {
            return "Tire service";
        }
        return "Voice-described service";
    }

    private String inferPartsReplaced(String transcript) {
        if (transcript.contains("filter")) {
            return "Mock extracted filter replacement";
        }
        if (transcript.contains("battery")) {
            return "Mock extracted battery replacement";
        }
        if (transcript.contains("brake pad")) {
            return "Mock extracted brake pad replacement";
        }
        return null;
    }
}
