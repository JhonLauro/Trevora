package com.trevora.api.features.serviceinput;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class OCRProcessingService {
    private static final int OPENAI_SAFE_OCR_CHARS = 12000;

    private final GoogleVisionOCRProvider googleVisionOCRProvider;
    private final OpenAIServiceDraftExtractionProvider openAIExtractionProvider;
    private final ServiceClassificationService classificationService;
    private final String ocrProvider;
    private final String aiProvider;

    public OCRProcessingService(
            GoogleVisionOCRProvider googleVisionOCRProvider,
            OpenAIServiceDraftExtractionProvider openAIExtractionProvider,
            ServiceClassificationService classificationService,
            @Value("${trevora.ocr.provider:mock}") String ocrProvider,
            @Value("${trevora.ai.extraction.provider:mock}") String aiProvider
    ) {
        this.googleVisionOCRProvider = googleVisionOCRProvider;
        this.openAIExtractionProvider = openAIExtractionProvider;
        this.classificationService = classificationService;
        this.ocrProvider = normalizeProvider(ocrProvider, "mock");
        this.aiProvider = normalizeProvider(aiProvider, "mock");
    }

    public ReceiptExtractionResult extractReceiptFields(MultipartFile receiptImage) {
        return extractReceiptFields(List.of(receiptImage), "UPLOAD");
    }

    public ReceiptExtractionResult extractReceiptFields(List<MultipartFile> receiptImages, String receiptInputMode) {
        List<MultipartFile> files = receiptImages == null
                ? List.of()
                : receiptImages.stream().filter(file -> file != null && !file.isEmpty()).toList();
        String inputMode = normalizeInputMode(receiptInputMode);
        String firstFileName = files.isEmpty() ? "uploaded receipt" : fileNameFor(files.get(0));

        if (!"google-vision".equals(ocrProvider)) {
            return mockReceiptExtraction(firstFileName, inputMode, files.size(), List.of("OCR_PROVIDER is not set to google-vision."));
        }

        List<String> extractionErrors = new ArrayList<>();
        List<Map<String, Object>> pages = new ArrayList<>();
        List<String> combinedSections = new ArrayList<>();

        for (int index = 0; index < files.size(); index++) {
            MultipartFile file = files.get(index);
            int pageNumber = index + 1;
            String fileName = fileNameFor(file);
            Map<String, Object> page = new LinkedHashMap<>();
            page.put("pageNumber", pageNumber);
            page.put("originalFilename", fileName);
            page.put("inputMode", inputMode);
            page.put("ocrProvider", ocrProvider);

            try {
                String rawText = googleVisionOCRProvider.extractText(file);
                page.put("rawText", rawText);
                page.put("textLength", rawText.length());
                if (rawText.isBlank()) {
                    page.put("ocrStatus", "EMPTY");
                    page.put("errorMessage", "Google Cloud Vision OCR returned empty text.");
                    extractionErrors.add("Page " + pageNumber + " (" + fileName + "): Google Cloud Vision OCR returned empty text.");
                } else {
                    page.put("ocrStatus", "SUCCESS");
                    combinedSections.add(pageHeader(pageNumber, inputMode, fileName) + "\n" + rawText);
                }
            } catch (ReceiptProcessingException exception) {
                page.put("rawText", "");
                page.put("textLength", 0);
                page.put("ocrStatus", "FAILED");
                page.put("errorMessage", exception.getMessage());
                extractionErrors.add("Page " + pageNumber + " (" + fileName + "): " + exception.getMessage());
            }
            pages.add(page);
        }

        String combinedOcrText = String.join("\n\n", combinedSections).trim();
        if (combinedOcrText.isBlank()) {
            return mockReceiptExtraction(firstFileName, inputMode, files.size(), extractionErrors.isEmpty()
                    ? List.of("No receipt pages were provided.")
                    : extractionErrors);
        }

        if (!"openai".equals(aiProvider)) {
            extractionErrors.add("AI_EXTRACTION_PROVIDER is not set to openai.");
            return rawOcrDraft(combinedOcrText, inputMode, pages, extractionErrors);
        }

        try {
            ReceiptDraftFields fields = openAIExtractionProvider.extractFields(combinedOcrText);
            return extractedDraft(fields, combinedOcrText, inputMode, pages, extractionErrors);
        } catch (ReceiptProcessingException exception) {
            extractionErrors.add(exception.getMessage());
            return rawOcrDraft(combinedOcrText, inputMode, pages, extractionErrors);
        }
    }

    private ReceiptExtractionResult extractedDraft(
            ReceiptDraftFields fields,
            String rawOcrText,
            String receiptInputMode,
            List<Map<String, Object>> pages,
            List<String> extractionErrors
    ) {
        ServiceClassification classification = classificationService.classifyAiOrFallback(
                fields.classification(),
                rawOcrText,
                fields.serviceType(),
                fields.partsReplaced(),
                fields.laborPerformed(),
                fields.remarks(),
                pages == null ? 0 : pages.size()
        );
        return new ReceiptExtractionResult(
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
                        "google_vision_openai",
                        rawOcrText,
                        receiptInputMode,
                        pages,
                        false,
                        fields.confidenceNotes(),
                        fields.fieldSources(),
                        fields.fieldConfidence(),
                        fields.aiSuggestedFields(),
                        classification,
                        fields.warnings(),
                        extractionErrors
                )
        );
    }

    private ReceiptExtractionResult rawOcrDraft(
            String rawOcrText,
            String receiptInputMode,
            List<Map<String, Object>> pages,
            List<String> extractionErrors
    ) {
        ServiceClassification classification = classificationService.keywordFallback(
                rawOcrText,
                null,
                null,
                null,
                rawOcrText,
                pages == null ? 0 : pages.size()
        );
        return new ReceiptExtractionResult(
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                rawOcrText,
                metadata(
                        "google_vision_raw_text",
                        rawOcrText,
                        receiptInputMode,
                        pages,
                        true,
                        List.of("OpenAI extraction was unavailable or invalid; review raw OCR text."),
                        Map.of(),
                        Map.of(),
                        List.of(),
                        classification,
                        List.of(),
                        extractionErrors
                )
        );
    }

    private ReceiptExtractionResult mockReceiptExtraction(
            String fileName,
            String receiptInputMode,
            int pageCount,
            List<String> extractionErrors
    ) {
        return new ReceiptExtractionResult(
                LocalDate.now(),
                "Receipt-based service",
                null,
                BigDecimal.valueOf(1500.00),
                "Mock OCR Auto Shop",
                null,
                "Mock extracted parts from " + fileName,
                "Mock extracted labor from receipt image",
                "Mock OCR extraction for MVP. Replace OCRProcessingService with a real provider later.",
                mockMetadata(fileName, receiptInputMode, pageCount, extractionErrors)
        );
    }

    private Map<String, Object> mockMetadata(
            String fileName,
            String receiptInputMode,
            int pageCount,
            List<String> extractionErrors
    ) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("inputMethod", "RECEIPT");
        metadata.put("inputType", "receipt");
        metadata.put("receiptInputMode", receiptInputMode);
        metadata.put("pageCount", Math.max(1, pageCount));
        metadata.put("source", "mock_ocr");
        metadata.put("ocrProvider", ocrProvider);
        metadata.put("aiProvider", aiProvider);
        metadata.put("aiModel", openAIExtractionProvider.model());
        metadata.put("fallbackUsed", true);
        metadata.put("rawOcrText", null);
        metadata.put("pages", List.of(Map.of(
                "pageNumber", 1,
                "originalFilename", fileName,
                "inputMode", receiptInputMode,
                "ocrProvider", ocrProvider,
                "rawText", "",
                "textLength", 0,
                "ocrStatus", "FAILED",
                "errorMessage", "Mock fallback used."
        )));
        metadata.put("confidenceNotes", List.of("Mock receipt extraction was used for demo reliability."));
        metadata.put("fieldSources", Map.of());
        metadata.put("fieldConfidence", Map.of());
        metadata.put("aiSuggestedFields", List.of());
        metadata.put("warnings", List.of("Receipt OCR fell back to mock extraction."));
        metadata.put("classification", classificationService.keywordFallback(
                "",
                "Receipt-based service",
                "Mock extracted parts from " + fileName,
                "Mock extracted labor from receipt image",
                "",
                Math.max(1, pageCount)
        ).toMetadata());
        metadata.put("fileName", fileName);
        metadata.put("confidence", Map.of(
                "serviceDate", 0.82,
                "serviceType", 0.74,
                "totalCost", 0.88,
                "shopName", 0.79
        ));
        if (!extractionErrors.isEmpty()) {
            metadata.put("extractionErrors", extractionErrors);
        }
        return metadata;
    }

    private Map<String, Object> metadata(
            String source,
            String rawOcrText,
            String receiptInputMode,
            List<Map<String, Object>> pages,
            boolean fallbackUsed,
            List<String> confidenceNotes,
            Map<String, Object> fieldSources,
            Map<String, String> fieldConfidence,
            List<String> aiSuggestedFields,
            ServiceClassification classification,
            List<String> aiWarnings,
            List<String> extractionErrors
    ) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("inputMethod", "RECEIPT");
        metadata.put("inputType", "receipt");
        metadata.put("receiptInputMode", receiptInputMode);
        metadata.put("pageCount", pages == null ? 0 : pages.size());
        metadata.put("source", source);
        metadata.put("ocrProvider", ocrProvider);
        metadata.put("aiProvider", aiProvider);
        metadata.put("aiModel", openAIExtractionProvider.model());
        metadata.put("fallbackUsed", fallbackUsed);
        metadata.put("rawOcrText", rawOcrText);
        metadata.put("pages", pages == null ? List.of() : pages);
        metadata.put("confidenceNotes", confidenceNotes == null ? List.of() : confidenceNotes);
        metadata.put("fieldSources", fieldSources == null ? Map.of() : fieldSources);
        metadata.put("fieldConfidence", fieldConfidence == null ? Map.of() : fieldConfidence);
        metadata.put("aiSuggestedFields", aiSuggestedFields == null ? List.of() : aiSuggestedFields);
        metadata.put("classification", classification == null ? Map.of() : classification.toMetadata());
        List<String> warnings = new ArrayList<>();
        if (aiWarnings != null) {
            warnings.addAll(aiWarnings.stream().filter(warning -> warning != null && !warning.isBlank()).toList());
        }
        if (rawOcrText != null && rawOcrText.length() > OPENAI_SAFE_OCR_CHARS) {
            warnings.add("Combined OCR text exceeded OpenAI safety length and was truncated for AI extraction.");
        }
        if (fallbackUsed) {
            warnings.add("Draft created from raw OCR because AI extraction was unavailable or invalid.");
        }
        metadata.put("warnings", warnings);
        if (extractionErrors != null && !extractionErrors.isEmpty()) {
            metadata.put("extractionErrors", extractionErrors);
        }
        return metadata;
    }

    private String fileNameFor(MultipartFile file) {
        return file.getOriginalFilename() == null || file.getOriginalFilename().isBlank()
                ? "receipt-page"
                : file.getOriginalFilename();
    }

    private String pageHeader(int pageNumber, String inputMode, String fileName) {
        return "[PAGE " + pageNumber + " - " + inputMode + " - " + fileName + "]";
    }

    private String normalizeInputMode(String value) {
        if ("SCAN".equalsIgnoreCase(value)) {
            return "SCAN";
        }
        return "UPLOAD";
    }

    private String normalizeProvider(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
