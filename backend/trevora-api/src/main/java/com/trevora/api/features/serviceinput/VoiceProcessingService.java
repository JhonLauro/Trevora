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
    private final ServiceClassificationService classificationService;
    private final String aiProvider;

    public VoiceProcessingService(
            OpenAIServiceDraftExtractionProvider openAIExtractionProvider,
            ServiceClassificationService classificationService,
            @Value("${trevora.ai.extraction.provider:mock}") String aiProvider
    ) {
        this.openAIExtractionProvider = openAIExtractionProvider;
        this.classificationService = classificationService;
        this.aiProvider = normalizeProvider(aiProvider, "mock");
    }

    public VoiceDraftExtractionResult extractServiceFields(String transcript) {
        String cleanedTranscript = transcript == null ? "" : transcript.trim();
        if (cleanedTranscript.isBlank()) {
            throw new VoiceTranscriptionException("Voice transcript is required before creating a draft.");
        }

        if (!"openai".equals(aiProvider)) {
            return transcriptOnlyDraft(
                    cleanedTranscript,
                    List.of("AI_EXTRACTION_PROVIDER is not set to openai; review and fill the service fields manually.")
            );
        }

        try {
            ReceiptDraftFields fields = openAIExtractionProvider.extractVoiceFields(cleanedTranscript);
            return extractedVoiceDraft(fields, cleanedTranscript);
        } catch (ReceiptProcessingException exception) {
            return transcriptOnlyDraft(cleanedTranscript, List.of(exception.getMessage()));
        }
    }

    private VoiceDraftExtractionResult extractedVoiceDraft(ReceiptDraftFields fields, String transcript) {
        ServiceClassification classification = classificationService.classifyAiOrFallback(
                fields.classification(),
                transcript,
                fields.serviceType(),
                fields.partsReplaced(),
                fields.laborPerformed(),
                fields.remarks(),
                1
        );
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
                        fields.fieldSources(),
                        fields.fieldConfidence(),
                        fields.aiSuggestedFields(),
                        classification,
                        fields.warnings()
                )
        );
    }

    private VoiceDraftExtractionResult transcriptOnlyDraft(String transcript, List<String> extractionErrors) {
        List<String> warnings = List.of("Draft needs manual review because structured voice extraction was unavailable or incomplete.");
        return new VoiceDraftExtractionResult(
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                metadata(
                        "voice_transcript_manual_review",
                        transcript,
                        true,
                        List.of("No structured service fields were extracted from the voice transcript."),
                        Map.of(),
                        Map.of(),
                        List.of(),
                        null,
                        extractionErrors == null || extractionErrors.isEmpty() ? warnings : mergeLists(warnings, extractionErrors)
                )
        );
    }

    private Map<String, Object> metadata(
            String source,
            String transcript,
            boolean fallbackUsed,
            List<String> confidenceNotes,
            Map<String, Object> fieldSources,
            Map<String, String> fieldConfidence,
            List<String> aiSuggestedFields,
            ServiceClassification classification,
            List<String> warnings
    ) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("inputMethod", "VOICE");
        metadata.put("inputType", "voice");
        metadata.put("source", source);
        metadata.put("aiProvider", aiProvider);
        metadata.put("aiModel", openAIExtractionProvider.model());
        metadata.put("fallbackUsed", fallbackUsed);
        metadata.put("transcript", transcript);
        metadata.put("confidenceNotes", confidenceNotes == null ? List.of() : confidenceNotes);
        metadata.put("fieldSources", fieldSources == null ? Map.of() : fieldSources);
        metadata.put("fieldConfidence", fieldConfidence == null ? Map.of() : fieldConfidence);
        metadata.put("aiSuggestedFields", aiSuggestedFields == null ? List.of() : aiSuggestedFields);
        metadata.put("classification", classification == null ? Map.of() : classification.toMetadata());
        metadata.put("warnings", warnings == null ? List.of() : warnings);
        return metadata;
    }

    private List<String> mergeLists(List<String> first, List<String> second) {
        return java.util.stream.Stream.concat(
                first == null ? java.util.stream.Stream.empty() : first.stream(),
                second == null ? java.util.stream.Stream.empty() : second.stream()
        ).toList();
    }

    private String normalizeProvider(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
