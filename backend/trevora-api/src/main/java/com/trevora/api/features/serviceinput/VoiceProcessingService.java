package com.trevora.api.features.serviceinput;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class VoiceProcessingService {
    private final OpenAIServiceDraftExtractionProvider openAIExtractionProvider;
    private final String aiProvider;

    public VoiceProcessingService(
            OpenAIServiceDraftExtractionProvider openAIExtractionProvider,
            @Value("${trevora.ai.extraction.provider:mock}") String aiProvider
    ) {
        this.openAIExtractionProvider = openAIExtractionProvider;
        this.aiProvider = normalizeProvider(aiProvider, "mock");
    }

    public VoiceDraftExtractionResult extractServiceFields(String transcript) {
        String cleanedTranscript = transcript.trim();

        if (!"openai".equals(aiProvider)) {
            throw new VoiceTranscriptionException("Voice draft extraction is not configured. Set AI_EXTRACTION_PROVIDER=openai and OPENAI_API_KEY before creating voice drafts.");
        }

        try {
            ReceiptDraftFields fields = openAIExtractionProvider.extractVoiceFields(cleanedTranscript);
            return extractedVoiceDraft(fields, cleanedTranscript);
        } catch (ReceiptProcessingException exception) {
            throw new VoiceTranscriptionException("Voice draft extraction failed: " + exception.getMessage(), exception);
        }
    }

    private VoiceDraftExtractionResult extractedVoiceDraft(ReceiptDraftFields fields, String transcript) {
        return new VoiceDraftExtractionResult(
                fields.serviceDate(),
                fields.serviceType(),
                fields.odometer(),
                fields.totalCost(),
                fields.shopName(),
                fields.location(),
                fields.partsReplaced(),
                fields.laborPerformed(),
                fields.remarks(),
                metadata(
                        "openai_voice_extraction",
                        transcript,
                        false,
                        fields.confidenceNotes(),
                        fields.fieldSources()
                )
        );
    }

    private Map<String, Object> metadata(
            String source,
            String transcript,
            boolean fallbackUsed,
            List<String> confidenceNotes,
            Map<String, String> fieldSources
    ) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("inputMethod", "VOICE");
        metadata.put("inputType", "voice");
        metadata.put("source", source);
        metadata.put("transcript", transcript);
        metadata.put("aiProvider", aiProvider);
        metadata.put("aiModel", openAIExtractionProvider.model());
        metadata.put("fallbackUsed", fallbackUsed);
        metadata.put("confidenceNotes", confidenceNotes == null ? List.of() : confidenceNotes);
        metadata.put("fieldSources", fieldSources == null ? Map.of() : fieldSources);
        metadata.put("warnings", List.of());
        return metadata;
    }

    private String normalizeProvider(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
