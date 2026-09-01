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
    /**
     * Beyond this the skew estimate is likelier to be wrong than the page is to
     * be that crooked, and rotating by a bad angle is far worse than not
     * rotating at all. About 25 degrees.
     */
    private static final double MAX_SKEW_RADIANS = 0.44;
    /** Too few words and the median angle is one word's noise, not the page. */
    private static final int MIN_WORDS_FOR_SKEW = 8;
    /** Below this, the wider-words preference is starving the estimate rather than sharpening it. */
    private static final int MIN_ANGLE_SAMPLES = 8;

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

        // Straighten the page before deciding what a row is. See estimateSkew.
        double skew = estimateSkew(words);
        List<PositionedWord> straightened = words.stream().map(word -> word.deskewed(skew)).toList();

        double medianHeight = median(straightened.stream().map(PositionedWord::height).sorted().toList());
        if (medianHeight <= 0) {
            return "";
        }
        // Half a line height: enough to hold a row together, tight enough not
        // to merge two adjacent rows. Meaningful only once the page is straight
        // — on a tilted one, half a line is the drift across a few centimetres
        // of paper and the tolerance is spent before it reaches the far column.
        double rowTolerance = medianHeight * 0.5;
        double columnGap = medianHeight * 1.5;

        StringBuilder text = new StringBuilder();
        for (List<PositionedWord> row : groupIntoRows(straightened, rowTolerance)) {
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
     * The angle the printed lines actually run at, in radians.
     *
     * <p><b>Why.</b> Rows were grouped by raw vertical position, which assumes
     * the paper was square to the camera. Photographs of receipts never are. On
     * a page tilted even slightly, a row spanning the sheet drifts vertically
     * from one edge to the other by more than the row tolerance, and the row
     * breaks apart — or worse, a label pairs with the value from the row above.
     * A real Toyota repair order came out with {@code GRAND TOTAL | 592.93}
     * against a printed grand total of 5,534.01: every label had collected the
     * amount belonging to the line above it, and 592.93 is the VAT. Nothing
     * downstream can detect that, because a wrong total looks exactly like a
     * right one.
     *
     * <p><b>How.</b> Every word's bounding box is a quadrilateral, not a
     * rectangle: Vision returns its four corners in the order the word was
     * printed, so the top edge of each word points along the text direction.
     * The median of those angles is the page's skew — median rather than mean
     * because a handful of words will always be misboxed, and one wild angle
     * must not tilt the whole page.
     *
     * <p>Only words wide enough to have a reliable direction are counted. The
     * angle of a two-character word is mostly noise, and a receipt is full of
     * them.
     *
     * <p>Returns 0 when there is too little evidence, or when the estimate comes
     * out beyond {@link #MAX_SKEW_RADIANS}. A page genuinely rotated that far is
     * rarer than an estimate that has gone wrong, and rotating by a bad angle is
     * far more destructive than not rotating at all.
     */
    double estimateSkew(List<PositionedWord> words) {
        List<PositionedWord> measurable = words.stream()
                .filter(word -> word.width() > 0)
                .toList();
        if (measurable.size() < MIN_WORDS_FOR_SKEW) {
            return 0;
        }

        double medianWidth = median(measurable.stream().map(PositionedWord::width).sorted().toList());
        List<Double> angles = measurable.stream()
                .filter(word -> word.width() >= medianWidth)
                .map(PositionedWord::angle)
                .sorted()
                .toList();
        // Preferring the wider half sharpens the estimate on a dense page and
        // starves it on a sparse one - a thermal slip may only have a dozen
        // words in total. The minimum above already guarantees enough evidence,
        // so when the preference leaves too little, take every word instead of
        // giving up: a slightly noisier angle beats no correction at all.
        if (angles.size() < MIN_ANGLE_SAMPLES) {
            angles = measurable.stream().map(PositionedWord::angle).sorted().toList();
        }

        double skew = median(angles);
        return Math.abs(skew) > MAX_SKEW_RADIANS ? 0 : skew;
    }

    /**
     * Rows, top to bottom.
     *
     * <p>Words are swept in vertical order and appended to the open row while
     * their centre stays within tolerance of the row's <b>median</b> centre.
     *
     * <p>It used to compare against the running <i>mean</i>, deliberately, so
     * that the reference would drift with the text and hold a skewed row
     * together. That worked and also caused the failure it was meant to prevent.
     * A mean moves towards every word added, so each borderline word pulls the
     * reference a little further down the page and makes the next borderline
     * word easier to absorb. Once a row has swallowed one word from the row
     * below, it has moved closer to that row and tends to take more. The
     * Toyota repair order's totals block came out with every amount attached to
     * the label beneath its own — a ratchet, not a wobble.
     *
     * <p>Two changes stop it. Skew is now corrected before this runs, so rows
     * really are horizontal and a drifting reference is no longer needed for
     * anything. And the median ignores outliers instead of being moved by them:
     * a single wrongly-admitted word cannot shift the row it landed in, so one
     * mistake stays one mistake.
     */
    private List<List<PositionedWord>> groupIntoRows(List<PositionedWord> words, double tolerance) {
        List<PositionedWord> sorted = new ArrayList<>(words);
        sorted.sort(Comparator.comparingDouble(PositionedWord::centreY));

        List<List<PositionedWord>> rows = new ArrayList<>();
        List<PositionedWord> current = new ArrayList<>();
        List<Double> centres = new ArrayList<>();
        double reference = 0;

        for (PositionedWord word : sorted) {
            if (current.isEmpty()) {
                current.add(word);
                centres.add(word.centreY());
                reference = word.centreY();
                continue;
            }
            if (Math.abs(word.centreY() - reference) <= tolerance) {
                current.add(word);
                // Sorted insert keeps the median cheap: the sweep is already in
                // ascending centre order, so this appends in all but pathological
                // cases.
                int at = java.util.Collections.binarySearch(centres, word.centreY());
                centres.add(at < 0 ? -at - 1 : at, word.centreY());
                reference = median(centres);
            } else {
                rows.add(current);
                current = new ArrayList<>();
                centres = new ArrayList<>();
                current.add(word);
                centres.add(word.centreY());
                reference = word.centreY();
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
        if (!vertices.isArray() || vertices.size() < 4) {
            return null;
        }
        // Vision returns the four corners in printed order — top-left,
        // top-right, bottom-right, bottom-left — so this is a quadrilateral
        // carrying the word's orientation, not an upright rectangle. Collapsing
        // it to its min/max box, as this used to, threw the orientation away and
        // inflated the height of every slanted word, which then inflated the
        // median height that sets the row tolerance. A tilted page ended up with
        // a looser tolerance precisely where it needed a tighter one.
        double[] xs = new double[4];
        double[] ys = new double[4];
        for (int i = 0; i < 4; i++) {
            JsonNode vertex = vertices.get(i);
            // Vision omits x or y when the value is zero, which is a real
            // coordinate at the page edge rather than missing data.
            xs[i] = vertex.path("x").asDouble(0);
            ys[i] = vertex.path("y").asDouble(0);
        }

        double topEdgeX = xs[1] - xs[0];
        double topEdgeY = ys[1] - ys[0];
        double width = Math.hypot(topEdgeX, topEdgeY);
        double height = Math.hypot(xs[3] - xs[0], ys[3] - ys[0]);
        if (width <= 0 && height <= 0) {
            return null;
        }
        double angle = width > 0 ? Math.atan2(topEdgeY, topEdgeX) : 0;

        double centreX = (xs[0] + xs[1] + xs[2] + xs[3]) / 4.0;
        double centreY = (ys[0] + ys[1] + ys[2] + ys[3]) / 4.0;
        return new PositionedWord(rendered, centreX, centreY, width, height, angle);
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

    /**
     * One OCR word, where it sat on the page, and which way it was printed.
     *
     * <p>Held as a centre plus a size and an angle rather than as edges,
     * because the word is a rotated quadrilateral and edges only describe an
     * upright one. {@link #left()} and {@link #right()} are derived, and are
     * meaningful only after {@link #deskewed(double)} has straightened the page
     * — which is exactly when the column logic uses them.
     */
    record PositionedWord(
            String text,
            double centreX,
            double centreY,
            double width,
            double height,
            double angle
    ) {
        /**
         * The same word with the page's skew rotated out of it.
         *
         * <p>Rotating the coordinates by {@code -skew} about the origin puts
         * the printed lines back on the horizontal, so that vertical position
         * means "which row" again rather than "which row, plus however far
         * across the page this happens to be". The word keeps its size; only
         * where it sits changes, and its angle becomes its angle relative to the
         * now-straight page.
         */
        PositionedWord deskewed(double skew) {
            if (skew == 0) {
                return this;
            }
            double cos = Math.cos(skew);
            double sin = Math.sin(skew);
            return new PositionedWord(
                    text,
                    centreX * cos + centreY * sin,
                    -centreX * sin + centreY * cos,
                    width,
                    height,
                    angle - skew
            );
        }

        double left() {
            return centreX - width / 2.0;
        }

        double right() {
            return centreX + width / 2.0;
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
