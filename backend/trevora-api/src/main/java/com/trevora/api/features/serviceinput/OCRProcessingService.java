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
    private final TesseractOCRProvider tesseractOCRProvider;
    private final OpenAIServiceDraftExtractionProvider openAIExtractionProvider;
    private final String ocrProvider;
    private final String aiProvider;

    public OCRProcessingService(
            TesseractOCRProvider tesseractOCRProvider,
            OpenAIServiceDraftExtractionProvider openAIExtractionProvider,
            @Value("${trevora.ocr.provider:mock}") String ocrProvider,
            @Value("${trevora.ai.extraction.provider:mock}") String aiProvider
    ) {
        this.tesseractOCRProvider = tesseractOCRProvider;
        this.openAIExtractionProvider = openAIExtractionProvider;
        this.ocrProvider = normalizeProvider(ocrProvider, "mock");
        this.aiProvider = normalizeProvider(aiProvider, "mock");
    }

    public ReceiptExtractionResult extractReceiptFields(MultipartFile receiptImage) {
        String fileName = receiptImage.getOriginalFilename() == null
                ? "uploaded receipt"
                : receiptImage.getOriginalFilename();

        if (!"tesseract".equals(ocrProvider)) {
            return mockReceiptExtraction(fileName, List.of("OCR_PROVIDER is not set to tesseract."));
        }

        List<String> extractionErrors = new ArrayList<>();
        String rawOcrText;
        try {
            rawOcrText = tesseractOCRProvider.extractText(receiptImage);
            if (rawOcrText.isBlank()) {
                return mockReceiptExtraction(fileName, List.of("Tesseract OCR returned empty text."));
            }
        } catch (ReceiptProcessingException exception) {
            return mockReceiptExtraction(fileName, List.of(exception.getMessage()));
        }

        if (!"openai".equals(aiProvider)) {
            extractionErrors.add("AI_EXTRACTION_PROVIDER is not set to openai.");
            return rawOcrDraft(rawOcrText, extractionErrors);
        }

        try {
            ReceiptDraftFields fields = openAIExtractionProvider.extractFields(rawOcrText);
            return extractedDraft(fields, rawOcrText);
        } catch (ReceiptProcessingException exception) {
            extractionErrors.add(exception.getMessage());
            return rawOcrDraft(rawOcrText, extractionErrors);
        }
    }

    private ReceiptExtractionResult extractedDraft(ReceiptDraftFields fields, String rawOcrText) {
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
                metadata("tesseract_openai", rawOcrText, false, fields.confidenceNotes(), List.of())
        );
    }

    private ReceiptExtractionResult rawOcrDraft(String rawOcrText, List<String> extractionErrors) {
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
                metadata("tesseract_raw_text", rawOcrText, true, List.of("OpenAI extraction was unavailable or invalid; review raw OCR text."), extractionErrors)
        );
    }

    private ReceiptExtractionResult mockReceiptExtraction(String fileName, List<String> extractionErrors) {
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
                mockMetadata(fileName, extractionErrors)
        );
    }

    private Map<String, Object> mockMetadata(String fileName, List<String> extractionErrors) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("inputMethod", "RECEIPT");
        metadata.put("source", "mock_ocr");
        metadata.put("ocrProvider", ocrProvider);
        metadata.put("aiProvider", aiProvider);
        metadata.put("aiModel", openAIExtractionProvider.model());
        metadata.put("fallbackUsed", true);
        metadata.put("rawOcrText", null);
        metadata.put("confidenceNotes", List.of("Mock receipt extraction was used for demo reliability."));
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
            boolean fallbackUsed,
            List<String> confidenceNotes,
            List<String> extractionErrors
    ) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("inputMethod", "RECEIPT");
        metadata.put("source", source);
        metadata.put("ocrProvider", ocrProvider);
        metadata.put("aiProvider", aiProvider);
        metadata.put("aiModel", openAIExtractionProvider.model());
        metadata.put("fallbackUsed", fallbackUsed);
        metadata.put("rawOcrText", rawOcrText);
        metadata.put("confidenceNotes", confidenceNotes == null ? List.of() : confidenceNotes);
        if (extractionErrors != null && !extractionErrors.isEmpty()) {
            metadata.put("extractionErrors", extractionErrors);
        }
        return metadata;
    }

    private String normalizeProvider(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
