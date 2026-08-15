package com.trevora.api.features.serviceinput;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;

@Service
public class GoogleVisionOCRProvider {
    private static final String VISION_ANNOTATE_URL = "https://vision.googleapis.com/v1/images:annotate";
    // Vision classifies each text block; these types are never useful receipt content.
    private static final Set<String> NOISE_BLOCK_TYPES = Set.of("BARCODE", "PICTURE", "RULER");
    // Blocks Vision itself is unsure about are usually visual noise (stray marks, logos) rather than real text.
    private static final double MIN_BLOCK_CONFIDENCE = 0.35;

    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final String apiKey;

    public GoogleVisionOCRProvider(
            ObjectMapper objectMapper,
            @Value("${trevora.ocr.google-vision.api-key:}") String apiKey
    ) {
        this.objectMapper = objectMapper;
        this.restClient = RestClient.create();
        this.apiKey = blankToNull(apiKey);
    }

    public String extractText(MultipartFile receiptImage) {
        if (apiKey == null) {
            throw new ReceiptProcessingException("Google Cloud Vision OCR is enabled but GOOGLE_CLOUD_VISION_API_KEY is not configured.");
        }

        String base64Image;
        try {
            base64Image = Base64.getEncoder().encodeToString(receiptImage.getBytes());
        } catch (IOException exception) {
            throw new ReceiptProcessingException("Could not read the receipt image for Google Cloud Vision OCR.", exception);
        }

        Map<String, Object> request = Map.of(
                "requests", List.of(
                        Map.of(
                                "image", Map.of("content", base64Image),
                                "features", List.of(Map.of("type", "DOCUMENT_TEXT_DETECTION"))
                        )
                )
        );

        try {
            String responseBody = restClient.post()
                    .uri(VISION_ANNOTATE_URL + "?key=" + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(String.class);

            return parseResponse(responseBody);
        } catch (RestClientResponseException exception) {
            throw new ReceiptProcessingException("Google Cloud Vision OCR failed with HTTP status " + exception.getStatusCode().value() + ".", exception);
        } catch (RestClientException exception) {
            throw new ReceiptProcessingException("Google Cloud Vision OCR request failed.", exception);
        }
    }

    String parseResponse(String responseBody) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode firstResponse = root.path("responses").path(0);

            JsonNode errorNode = firstResponse.path("error");
            if (!errorNode.isMissingNode() && !errorNode.isNull()) {
                String message = errorNode.path("message").asText("Unknown Google Cloud Vision error.");
                throw new ReceiptProcessingException("Google Cloud Vision OCR returned an error: " + message);
            }

            JsonNode pagesNode = firstResponse.path("fullTextAnnotation").path("pages");
            if (pagesNode.isArray() && !pagesNode.isEmpty()) {
                String structuredText = structuredTextFromBlocks(pagesNode);
                if (!structuredText.isBlank()) {
                    return structuredText;
                }
            }

            JsonNode fullTextNode = firstResponse.path("fullTextAnnotation").path("text");
            if (fullTextNode.isTextual() && !fullTextNode.asText().isBlank()) {
                return fullTextNode.asText().trim();
            }

            JsonNode firstAnnotation = firstResponse.path("textAnnotations").path(0).path("description");
            if (firstAnnotation.isTextual()) {
                return firstAnnotation.asText().trim();
            }

            return "";
        } catch (IOException exception) {
            throw new ReceiptProcessingException("Google Cloud Vision OCR returned an unreadable response.", exception);
        }
    }

    // Uses Vision's block/paragraph/word/symbol structure instead of the flat fullTextAnnotation.text
    // so barcode/logo/ruler blocks and low-confidence garbage can be dropped before the text ever
    // reaches the AI extraction step, rather than relying on the LLM to guess what to ignore.
    private String structuredTextFromBlocks(JsonNode pagesNode) {
        List<String> blockTexts = new ArrayList<>();
        for (JsonNode page : pagesNode) {
            for (JsonNode block : page.path("blocks")) {
                String blockType = block.path("blockType").asText("TEXT");
                if (NOISE_BLOCK_TYPES.contains(blockType.toUpperCase())) {
                    continue;
                }
                if (block.has("confidence") && block.path("confidence").asDouble(1.0) < MIN_BLOCK_CONFIDENCE) {
                    continue;
                }
                String blockText = textForBlock(block);
                if (!blockText.isBlank()) {
                    blockTexts.add(blockText);
                }
            }
        }
        return String.join("\n\n", blockTexts).trim();
    }

    private String textForBlock(JsonNode block) {
        StringBuilder blockBuilder = new StringBuilder();
        for (JsonNode paragraph : block.path("paragraphs")) {
            StringBuilder paragraphBuilder = new StringBuilder();
            for (JsonNode word : paragraph.path("words")) {
                for (JsonNode symbol : word.path("symbols")) {
                    paragraphBuilder.append(symbol.path("text").asText(""));
                    appendDetectedBreak(paragraphBuilder, symbol.path("property").path("detectedBreak").path("type").asText(""));
                }
            }
            String paragraphText = paragraphBuilder.toString().trim();
            if (!paragraphText.isBlank()) {
                blockBuilder.append(paragraphText).append('\n');
            }
        }
        return blockBuilder.toString().trim();
    }

    private void appendDetectedBreak(StringBuilder builder, String breakType) {
        switch (breakType) {
            case "SPACE", "SURE_SPACE" -> builder.append(' ');
            case "EOL_SURE_SPACE", "LINE_BREAK" -> builder.append('\n');
            case "HYPHEN" -> builder.append("-\n");
            default -> {
                // NONE (or unrecognized): no separator between this symbol and the next.
            }
        }
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
