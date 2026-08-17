package com.trevora.api.features.serviceinput;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class VoiceProcessingService {
    private static final Pattern LABELED_SHOP_NAME_PATTERN = Pattern.compile(
            "\\b(?:(?:shop name|repair shop name|service center name|garage name|dealership name)\\s+(?:is|was|called|named)?|(?:shop|repair shop|service center|garage|dealership|dealer)\\s+(?:is|was|at|from|called|named))\\s+(.+?)(?=\\s+(?:and|for|cost|costs|charged|on|with|because|then|where)\\b|[.,;\\n]|$)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern CUED_SHOP_NAME_PATTERN = Pattern.compile(
            "\\b(?:at|from|by|with|to)\\s+(.+?(?:auto(?:motive)?|motors|garage|repair(?:s)?|service(?:\\s+center)?|shop|dealership|dealer|car care|tire(?:s)?|vulcanizing)[^.,;\\n]*?)(?=\\s+(?:and|for|cost|costs|charged|on|with|because|then|where)\\b|[.,;\\n]|$)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern SHOP_NAME_KEYWORD_PATTERN = Pattern.compile(
            "\\b(?:auto(?:motive)?|motors|garage|repair(?:s)?|service(?:\\s+center)?|shop|dealership|dealer|car care|tire(?:s)?|vulcanizing)\\b",
            Pattern.CASE_INSENSITIVE
    );

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
        ShopMention fallbackShopName = blankToNull(fields.shopName()) == null
                ? extractMentionedShopName(transcript)
                : null;
        String shopName = fallbackShopName == null ? fields.shopName() : fallbackShopName.value();
        Map<String, Object> fieldSources = new LinkedHashMap<>(fields.fieldSources() == null ? Map.of() : fields.fieldSources());
        Map<String, String> fieldConfidence = new LinkedHashMap<>(fields.fieldConfidence() == null ? Map.of() : fields.fieldConfidence());
        List<String> confidenceNotes = new ArrayList<>(fields.confidenceNotes() == null ? List.of() : fields.confidenceNotes());

        if (fallbackShopName != null) {
            fieldSources.put("shopName", shopNameEvidence(fallbackShopName));
            fieldConfidence.put("shopName", "medium");
            confidenceNotes.add("Shop name was captured from an explicit spoken phrase. Review the spelling before saving.");
        }

        List<ServiceItemFields> classifiedServices = new ArrayList<>();
        List<ServiceItemFields> rawServices = fields.services() == null ? List.of() : fields.services();
        for (ServiceItemFields item : rawServices) {
            ServiceClassification itemClassification = classificationService.classifyAiOrFallback(
                    fields.classification(),
                    transcript,
                    item.serviceType(),
                    item.partsReplaced(),
                    item.laborPerformed(),
                    fields.remarks(),
                    1
            );
            classifiedServices.add(item.withClassification(itemClassification));
        }
        ServiceClassification overallClassification = classificationService.classifyAiOrFallback(
                fields.classification(),
                transcript,
                null,
                null,
                null,
                fields.remarks(),
                1
        );
        return new VoiceDraftExtractionResult(
                fields.serviceDate(),
                classifiedServices,
                fields.odometer(),
                fields.totalCost(),
                shopName,
                fields.location(),
                fields.remarks(),
                metadata(
                        "openai_voice_extraction",
                        transcript,
                        false,
                        confidenceNotes,
                        fieldSources,
                        fieldConfidence,
                        fields.aiSuggestedFields(),
                        overallClassification,
                        fields.warnings()
                )
        );
    }

    private VoiceDraftExtractionResult transcriptOnlyDraft(String transcript, List<String> extractionErrors) {
        List<String> warnings = List.of("Draft needs manual review because structured voice extraction was unavailable or incomplete.");
        return new VoiceDraftExtractionResult(
                null,
                List.of(),
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

    private Map<String, Object> shopNameEvidence(ShopMention mention) {
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("value", mention.value());
        evidence.put("confidence", "medium");
        evidence.put("sourceType", "EXTRACTED_FROM_TEXT");
        evidence.put("sourceText", mention.sourceText());
        evidence.put("needsReview", true);
        return evidence;
    }

    private ShopMention extractMentionedShopName(String transcript) {
        ShopMention labeledMention = findMention(transcript, LABELED_SHOP_NAME_PATTERN, true);
        if (labeledMention != null) {
            return labeledMention;
        }
        return findMention(transcript, CUED_SHOP_NAME_PATTERN, false);
    }

    private ShopMention findMention(String transcript, Pattern pattern, boolean labeled) {
        if (transcript == null || transcript.isBlank()) {
            return null;
        }

        Matcher matcher = pattern.matcher(transcript);
        while (matcher.find()) {
            String value = cleanShopName(matcher.group(1));
            if (isUsableShopName(value, labeled)) {
                return new ShopMention(value, matcher.group(0).trim());
            }
        }
        return null;
    }

    private boolean isUsableShopName(String value, boolean labeled) {
        if (value == null || value.length() < 2) {
            return false;
        }
        if (labeled) {
            return true;
        }
        return SHOP_NAME_KEYWORD_PATTERN.matcher(value).find();
    }

    private String cleanShopName(String value) {
        String cleaned = blankToNull(value);
        if (cleaned == null) {
            return null;
        }
        cleaned = cleaned
                .replaceAll("^[\"'\\s]+|[\"'\\s]+$", "")
                .replaceAll("^(?i:the|a|an)\\s+", "")
                .replaceAll("\\s+", " ")
                .trim();
        return blankToNull(cleaned);
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

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private record ShopMention(String value, String sourceText) {
    }
}
