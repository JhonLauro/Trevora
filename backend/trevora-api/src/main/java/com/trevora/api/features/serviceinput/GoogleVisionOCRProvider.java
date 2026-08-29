package com.trevora.api.features.serviceinput;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import com.trevora.api.shared.http.OutboundHttp;
import org.springframework.web.multipart.MultipartFile;

@Service
public class GoogleVisionOCRProvider {
    private static final String VISION_ANNOTATE_URL = "https://vision.googleapis.com/v1/images:annotate";
    // Vision classifies each text block; these types are never useful receipt content.
    private static final Set<String> NOISE_BLOCK_TYPES = Set.of("BARCODE", "PICTURE", "RULER");
    // Blocks Vision itself is unsure about are usually visual noise (stray marks, logos) rather than real text.
    private static final double MIN_BLOCK_CONFIDENCE = 0.35;
    private static final List<String> LANGUAGE_HINTS = List.of("en", "fil");

    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final String apiKey;

    public GoogleVisionOCRProvider(
            ObjectMapper objectMapper,
            @Value("${trevora.ocr.google-vision.api-key:}") String apiKey
    ) {
        this.objectMapper = objectMapper;
        this.restClient = OutboundHttp.restClient(OutboundHttp.VISION_READ_TIMEOUT);
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
                                "features", List.of(Map.of("type", "DOCUMENT_TEXT_DETECTION")),
                                // PH receipts mix English and Tagalog, often on the
                                // same line. Naming both narrows the character set
                                // Vision considers and cuts misreads on the mixed
                                // text, which is where they cluster.
                                "imageContext", Map.of("languageHints", LANGUAGE_HINTS)
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
                // Layout first: a receipt is a table, and the column a number
                // sits in is what says whether it is a unit price or a line
                // total. Falls through to reading-order text when the response
                // carries no usable geometry.
                String layoutText = layoutTextFromPages(pagesNode);
                if (!layoutText.isBlank()) {
                    return layoutText;
                }
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

    /**
     * Rebuilds the printed rows of the receipt from Vision's word geometry.
     *
     * <p><b>Why this exists.</b> Vision returns text in its own reading order,
     * which on a tabular document is not the order a person reads. On a real
     * Toyota body-and-paint invoice the descriptions came out as one run and
     * every price collected into an unlabelled blob at the end: seventeen
     * amounts with nothing saying which line each belonged to. No prompt can
     * reattach them from that, so the model either guesses or declines, and
     * both are wrong answers to a question that had a right one.
     *
     * <p><b>How.</b> Every word carries a bounding box. Words whose vertical
     * centres fall within a tolerance of each other were printed on the same
     * row, whatever order Vision emitted them in; within a row, x position is
     * the column order. So: collect words, group by y, sort by x. The tolerance
     * is derived from the median word height rather than fixed, because it has
     * to hold for a thermal slip photographed close up and an A4 invoice
     * photographed from across a desk.
     *
     * <p>A horizontal gap noticeably wider than the text is tall is a column
     * boundary rather than a word space, and is emitted as a pipe so the
     * extraction prompt can be told what it means. Everything else is a space.
     *
     * <p>Block-level noise filtering still applies first, so barcodes, logos
     * and low-confidence blocks never reach this stage.
     *
     * @return the reconstructed text, or empty when the response carries no
     *     usable geometry, in which case the caller falls back to reading order
     */
    String layoutTextFromPages(JsonNode pagesNode) {
        List<PositionedWord> words = collectWords(pagesNode);
        if (words.isEmpty()) {
            return "";
        }

        double medianHeight = median(words.stream().map(PositionedWord::height).sorted().toList());
        if (medianHeight <= 0) {
            return "";
        }
        // Half a line height: enough to hold a row together when the paper is
        // slightly skewed, tight enough not to merge two adjacent rows.
        double rowTolerance = medianHeight * 0.5;
        double columnGap = medianHeight * 1.5;

        StringBuilder text = new StringBuilder();
        for (List<PositionedWord> row : groupIntoRows(words, rowTolerance)) {
            row.sort(Comparator.comparingDouble(PositionedWord::left));
            StringBuilder line = new StringBuilder();
            PositionedWord previous = null;
            for (PositionedWord word : row) {
                if (previous != null) {
                    line.append(word.left() - previous.right() > columnGap ? " | " : " ");
                }
                line.append(word.text());
                previous = word;
            }
            String rendered = line.toString().trim();
            if (!rendered.isEmpty()) {
                text.append(rendered).append('\n');
            }
        }
        return text.toString().trim();
    }

    /**
     * Rows, top to bottom.
     *
     * <p>Words are swept in vertical order and appended to the open row while
     * their centre stays within tolerance of it. Comparing against the row's
     * running centre rather than its first word is what lets a gently skewed
     * photograph still resolve into rows: the reference drifts with the text
     * instead of staying pinned to wherever the row happened to start.
     */
    private List<List<PositionedWord>> groupIntoRows(List<PositionedWord> words, double tolerance) {
        List<PositionedWord> sorted = new ArrayList<>(words);
        sorted.sort(Comparator.comparingDouble(PositionedWord::centreY));

        List<List<PositionedWord>> rows = new ArrayList<>();
        List<PositionedWord> current = new ArrayList<>();
        double runningCentre = 0;

        for (PositionedWord word : sorted) {
            if (current.isEmpty()) {
                current.add(word);
                runningCentre = word.centreY();
                continue;
            }
            if (Math.abs(word.centreY() - runningCentre) <= tolerance) {
                current.add(word);
                runningCentre = current.stream()
                        .mapToDouble(PositionedWord::centreY)
                        .average()
                        .orElse(runningCentre);
            } else {
                rows.add(current);
                current = new ArrayList<>();
                current.add(word);
                runningCentre = word.centreY();
            }
        }
        if (!current.isEmpty()) {
            rows.add(current);
        }
        return rows;
    }

    private List<PositionedWord> collectWords(JsonNode pagesNode) {
        List<PositionedWord> words = new ArrayList<>();
        for (JsonNode page : pagesNode) {
            for (JsonNode block : page.path("blocks")) {
                if (isNoise(block)) {
                    continue;
                }
                for (JsonNode paragraph : block.path("paragraphs")) {
                    for (JsonNode word : paragraph.path("words")) {
                        PositionedWord positioned = toPositionedWord(word);
                        if (positioned != null) {
                            words.add(positioned);
                        }
                    }
                }
            }
        }
        return words;
    }

    private PositionedWord toPositionedWord(JsonNode word) {
        StringBuilder text = new StringBuilder();
        for (JsonNode symbol : word.path("symbols")) {
            text.append(symbol.path("text").asText(""));
        }
        String rendered = text.toString().trim();
        if (rendered.isEmpty()) {
            return null;
        }

        JsonNode vertices = word.path("boundingBox").path("vertices");
        if (!vertices.isArray() || vertices.isEmpty()) {
            return null;
        }
        double left = Double.MAX_VALUE;
        double right = -Double.MAX_VALUE;
        double top = Double.MAX_VALUE;
        double bottom = -Double.MAX_VALUE;
        for (JsonNode vertex : vertices) {
            // Vision omits x or y when the value is zero, which is a real
            // coordinate at the page edge rather than missing data.
            double x = vertex.path("x").asDouble(0);
            double y = vertex.path("y").asDouble(0);
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
        if (right <= left && bottom <= top) {
            return null;
        }
        return new PositionedWord(rendered, left, right, top, bottom);
    }

    private boolean isNoise(JsonNode block) {
        String blockType = block.path("blockType").asText("TEXT");
        if (NOISE_BLOCK_TYPES.contains(blockType.toUpperCase())) {
            return true;
        }
        return block.has("confidence") && block.path("confidence").asDouble(1.0) < MIN_BLOCK_CONFIDENCE;
    }

    private static double median(List<Double> sorted) {
        if (sorted.isEmpty()) {
            return 0;
        }
        int size = sorted.size();
        return size % 2 == 1
                ? sorted.get(size / 2)
                : (sorted.get(size / 2 - 1) + sorted.get(size / 2)) / 2.0;
    }

    /** One OCR word and where it sat on the page. */
    private record PositionedWord(String text, double left, double right, double top, double bottom) {
        double centreY() {
            return (top + bottom) / 2.0;
        }

        double height() {
            return bottom - top;
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
