package com.trevora.api.features.serviceinput;

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
    /**
     * Pages one upload may carry. Each one is a separate billed Google Vision
     * call made in a loop while the caller waits, so without a ceiling a single
     * request could spend an unbounded amount of money and hold a request
     * thread for as long as it took. Ten covers the longest real invoice we
     * have seen with room to spare.
     */
    private final int maxReceiptPages;

    /**
     * Bytes one receipt page may weigh. The multipart ceiling has to clear a
     * voice recording, which is far larger than any photo, so it is no limit
     * at all here -- and the Vision provider reads a page into memory and then
     * base64-encodes it, so an oversized page costs roughly two and a third
     * times its own size in heap. Ten megabytes is well above an uncompressed
     * phone photo and nowhere near what would hurt.
     */
    private final long maxReceiptPageBytes;

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
            @Value("${trevora.ai.extraction.provider:mock}") String aiProvider,
            @Value("${trevora.receipt.max-pages:10}") int maxReceiptPages,
            @Value("${trevora.receipt.max-page-bytes:10485760}") long maxReceiptPageBytes
    ) {
        this.googleVisionOCRProvider = googleVisionOCRProvider;
        this.openAIExtractionProvider = openAIExtractionProvider;
        this.classificationService = classificationService;
        this.ocrProvider = normalizeProvider(ocrProvider, "mock");
        this.aiProvider = normalizeProvider(aiProvider, "mock");
        this.maxReceiptPages = Math.max(1, maxReceiptPages);
        this.maxReceiptPageBytes = Math.max(1L, maxReceiptPageBytes);
    }

    public ReceiptExtractionResult extractReceiptFields(MultipartFile receiptImage) {
        return extractReceiptFields(List.of(receiptImage), "UPLOAD", VehicleContext.UNKNOWN);
    }

    public ReceiptExtractionResult extractReceiptFields(List<MultipartFile> receiptImages, String receiptInputMode) {
        return extractReceiptFields(receiptImages, receiptInputMode, VehicleContext.UNKNOWN);
    }

    public ReceiptExtractionResult extractReceiptFields(
            List<MultipartFile> receiptImages,
            String receiptInputMode,
            VehicleContext vehicle
    ) {
        List<MultipartFile> files = receiptImages == null
                ? List.of()
                : receiptImages.stream().filter(file -> file != null && !file.isEmpty()).toList();
        /*
         * Checked before the provider is, so an over-long upload is rejected
         * the same way whether or not OCR is configured. Silently reading the
         * first ten would be worse than refusing: the draft would look complete
         * while missing whatever was on the pages we dropped.
         */
        if (files.size() > maxReceiptPages) {
            throw new ReceiptUploadException(
                    "A receipt can have at most " + maxReceiptPages + " pages. This upload has " + files.size() + "."
            );
        }
        files.stream()
                .filter(file -> file.getSize() > maxReceiptPageBytes)
                .findFirst()
                .ifPresent(file -> {
                    throw new ReceiptUploadException(
                            "Receipt page \"" + fileNameFor(file) + "\" is too large. Pages must be "
                                    + (maxReceiptPageBytes / (1024 * 1024)) + " MB or smaller."
                    );
                });
        String inputMode = normalizeInputMode(receiptInputMode);
        String firstFileName = files.isEmpty() ? "uploaded receipt" : fileNameFor(files.get(0));

        if (!"google-vision".equals(ocrProvider)) {
            return emptyExtraction(firstFileName, inputMode, files.size(), List.of("OCR_PROVIDER is not set to google-vision."));
        }

        List<String> extractionErrors = new ArrayList<>();
        List<Map<String, Object>> pages = new ArrayList<>();
        List<String> combinedSections = new ArrayList<>();
        // Kept separately from combinedSections because a multi-image upload is
        // extracted one page at a time. The combined text is still stored as
        // rawOcrText, so the draft carries everything that was read.
        List<String> pageTexts = new ArrayList<>();

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
                    String section = pageHeader(pageNumber, inputMode, fileName) + "\n" + rawText;
                    combinedSections.add(section);
                    pageTexts.add(section);
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
            return emptyExtraction(firstFileName, inputMode, files.size(), extractionErrors.isEmpty()
                    ? List.of("No receipt pages were provided.")
                    : extractionErrors);
        }

        if (!"openai".equals(aiProvider)) {
            extractionErrors.add("AI_EXTRACTION_PROVIDER is not set to openai.");
            return rawOcrDraft(combinedOcrText, inputMode, pages, extractionErrors);
        }

        try {
            // One extraction per document when the upload holds several, so a
            // repair order's quote and an invoice's real total are never two
            // numbers in the same block of text with nothing to separate them.
            ReceiptDraftFields fields = pageTexts.size() > 1
                    ? extractPerDocument(pageTexts, vehicle, extractionErrors)
                    : openAIExtractionProvider.extractFields(combinedOcrText, vehicle);
            if (fields == null) {
                extractionErrors.add("No page of this upload could be extracted.");
                return rawOcrDraft(combinedOcrText, inputMode, pages, extractionErrors);
            }
            return extractedDraft(fields, combinedOcrText, inputMode, pages, extractionErrors, vehicle);
        } catch (ReceiptProcessingException exception) {
            extractionErrors.add(exception.getMessage());
            return rawOcrDraft(combinedOcrText, inputMode, pages, extractionErrors);
        }
    }

    /**
     * Reads each image as its own document, then merges them.
     *
     * <p>Several images used to be concatenated and extracted once, which is
     * right for pages of one receipt and wrong for a stack of different
     * documents. A Toyota Talisay visit hands over five, and putting the repair
     * order's 5,534.01 and the invoice's 3,106.49 into one block of text left
     * the model choosing between two numbers that both look like the answer,
     * with nothing on the page to say which visit each belonged to.
     *
     * <p>Costs one extraction per image rather than one per upload. That is the
     * price of the correctness: there is no way to tell which sheet a number
     * came off without asking about each sheet separately. Single-image uploads
     * - almost everything a small shop hands over - are untouched and still cost
     * one call.
     *
     * <p>A page that fails to extract is recorded and skipped rather than
     * failing the upload. One unreadable photograph in a stack of five should
     * cost that page, not the visit.
     */
    private ReceiptDraftFields extractPerDocument(
            List<String> pageTexts,
            VehicleContext vehicle,
            List<String> extractionErrors
    ) {
        List<ReceiptDraftFields> perPage = new ArrayList<>();
        for (int index = 0; index < pageTexts.size(); index++) {
            try {
                ReceiptDraftFields extracted = openAIExtractionProvider.extractFields(pageTexts.get(index), vehicle);
                if (extracted != null) {
                    perPage.add(extracted);
                }
            } catch (ReceiptProcessingException exception) {
                extractionErrors.add("Page " + (index + 1) + ": " + exception.getMessage());
            }
        }
        return ReceiptDocumentMerger.merge(perPage);
    }

    private ReceiptExtractionResult extractedDraft(
            ReceiptDraftFields fields,
            String rawOcrText,
            String receiptInputMode,
            List<Map<String, Object>> pages,
            List<String> extractionErrors,
            VehicleContext vehicle
    ) {
        int pageCount = pages == null ? 0 : pages.size();
        List<ServiceItemFields> classifiedServices = classifyItems(fields.services(), fields.classification(), rawOcrText, fields.remarks(), pageCount, vehicle);
        ServiceClassification overallClassification = classificationService.classifyAiOrFallback(
                fields.classification(),
                rawOcrText,
                servicesHaystack(fields.services()),
                null,
                null,
                fields.remarks(),
                pageCount,
                vehicle
        );
        Map<String, Object> metadata = metadata(
                "google_vision_openai",
                rawOcrText,
                receiptInputMode,
                pages,
                false,
                fields.confidenceNotes(),
                fields.fieldSources(),
                fields.fieldConfidence(),
                fields.aiSuggestedFields(),
                overallClassification,
                fields.warnings(),
                extractionErrors
        );
        // The document's own number and the numbers it points at. Kept in
        // metadata rather than columns because nothing queries them yet: they
        // exist so the documents of one visit can be grouped later without
        // paying for another extraction pass over receipts already uploaded.
        metadata.put("documentType", fields.documentType().name());
        metadata.put("documentNumber", fields.documentNumber());
        metadata.put("referenceNumbers",
                fields.referenceNumbers() == null ? List.of() : fields.referenceNumbers());

        return new ReceiptExtractionResult(
                fields.documentType(),
                fields.documentNumber(),
                fields.referenceNumbers() == null ? List.of() : fields.referenceNumbers(),
                fields.serviceDate(),
                classifiedServices,
                fields.odometer(),
                fields.totalCost(),
                fields.shopName(),
                fields.location(),
                fields.remarks(),
                metadata
        );
    }

    private List<ServiceItemFields> classifyItems(
            List<ServiceItemFields> rawItems,
            ServiceClassification aiClassificationHint,
            String rawText,
            String remarks,
            int pageCount,
            VehicleContext vehicle
    ) {
        if (rawItems == null || rawItems.isEmpty()) {
            return List.of();
        }
        List<ServiceItemFields> classified = new ArrayList<>();
        for (ServiceItemFields item : rawItems) {
            ServiceClassification itemClassification = classificationService.classifyAiOrFallback(
                    aiClassificationHint,
                    rawText,
                    item.serviceType(),
                    item.partsReplaced(),
                    item.laborPerformed(),
                    remarks,
                    pageCount,
                    vehicle
            );
            classified.add(item.withClassification(itemClassification));
        }
        return classified;
    }

    private String servicesHaystack(List<ServiceItemFields> items) {
        if (items == null || items.isEmpty()) {
            return null;
        }
        return items.stream()
                .map(ServiceItemFields::serviceType)
                .filter(value -> value != null && !value.isBlank())
                .reduce((first, second) -> first + ", " + second)
                .orElse(null);
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
                // Nothing classified this: the model never ran. The default is
                // the one that does not silently strip the cost.
                DocumentType.defaultType(),
                null,
                List.of(),
                null,
                List.of(),
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

    /**
     * The draft returned when nothing could be read: no OCR provider, no
     * readable pages, no text.
     *
     * <p><b>It invents nothing.</b> An earlier version returned
     * {@code LocalDate.now()}, a total of PHP 1,500.00, a shop called "Mock OCR
     * Auto Shop" and a fabricated service line. Those are the exact fields the
     * owner is asked to confirm, and they arrived pre-filled and plausible, so
     * confirming the draft wrote invented history into a record whose whole
     * purpose is to be trustworthy to a buyer or a mechanic. A blank draft that
     * says why it is blank is worse UX and better data, and this project has
     * already chosen that trade twice — see the null {@code bodyType} that is
     * never back-filled, and the due-date grading that was removed rather than
     * guessed.
     */
    private ReceiptExtractionResult emptyExtraction(
            String fileName,
            String receiptInputMode,
            int pageCount,
            List<String> extractionErrors
    ) {
        return new ReceiptExtractionResult(
                DocumentType.defaultType(),
                null,
                List.of(),
                null,
                List.of(),
                null,
                null,
                null,
                null,
                null,
                unreadableMetadata(fileName, receiptInputMode, pageCount, extractionErrors)
        );
    }

    private Map<String, Object> unreadableMetadata(
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
        metadata.put("source", "unreadable");
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
                "errorMessage", "No text could be extracted."
        )));
        metadata.put("confidenceNotes", List.of("Nothing could be read from this receipt; every field was left blank."));
        metadata.put("fieldSources", Map.of());
        metadata.put("fieldConfidence", Map.of());
        metadata.put("aiSuggestedFields", List.of());
        metadata.put("warnings", List.of("No text could be extracted from this receipt. Enter the details manually, or retake the photo in better light."));
        // No text means no evidence, so no classification. Keyword-classifying an
        // empty string produced a confident "Receipt-based service" out of nothing.
        metadata.put("classification", Map.of());
        metadata.put("fileName", fileName);
        // No invented confidence scores. There is nothing to be confident about.
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
        // Truncation is reported by the extractor that performs it and arrives
        // in aiWarnings. Re-deriving it here also fired on the raw-OCR
        // fallback, which stores the whole text and truncates nothing.
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
