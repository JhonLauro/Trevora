package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * Layout reconstruction: turning Vision's reading order back into the rows that
 * were printed on the paper.
 *
 * <p>The fixtures are built from the shape of the real failure rather than
 * invented: on the Toyota body-and-paint invoice Vision returned the
 * description column as one block and the amounts as another, so reading order
 * produced every description followed by an unlabelled run of prices, and
 * nothing could say which amount belonged to which line.
 */
class GoogleVisionLayoutTest {
    private final GoogleVisionOCRProvider provider =
            new GoogleVisionOCRProvider(new ObjectMapper(), "test-key");

    @Test
    void reunitesAmountsWithTheDescriptionsTheyWerePrintedBeside() {
        String text = provider.parseResponse(DETACHED_COLUMNS);

        // Each amount is back on its own row, separated by the column marker.
        assertThat(text.lines().toList()).containsExactly(
                "SRA/FIX | 1,800.00",
                "PAINTING JOB | 7,600.00",
                "DEGREASER | 312.50",
                "WASTE PAD-BP | 25.00");
    }

    @Test
    void theAmountsNoLongerArriveAsAnUnlabelledRun() {
        String text = provider.parseResponse(DETACHED_COLUMNS);

        // The old behaviour: four descriptions, then four bare numbers. If this
        // ever comes back, line attribution silently becomes guesswork again.
        assertThat(text).doesNotContain("1,800.00\n7,600.00");
        for (String line : text.lines().toList()) {
            assertThat(line.trim()).as("no row may be a bare amount").doesNotMatch("^[0-9,.]+$");
        }
    }

    @Test
    void wordSpacingWithinAColumnStaysASpaceNotAColumnBreak() {
        String text = provider.parseResponse(DETACHED_COLUMNS);

        // "PAINTING JOB" is two words in one cell, not two columns.
        assertThat(text).contains("PAINTING JOB |");
        assertThat(text).doesNotContain("PAINTING | JOB");
    }

    @Test
    void rowsSurviveASkewedPhotograph() {
        // The amount sits a few pixels lower than the description it belongs to,
        // as it does whenever the paper is not square to the camera.
        String text = provider.parseResponse(SKEWED_ROWS);

        assertThat(text.lines().toList()).containsExactly(
                "CONDENSER | 150.00",
                "REPLACE CONDENSER | 350.00");
    }

    @Test
    void barcodesAreStillDroppedEvenWhenTheyShareARowWithRealText() {
        String text = provider.parseResponse(BARCODE_BESIDE_TEXT);

        assertThat(text).contains("TOTAL | 3,325.00");
        assertThat(text).doesNotContain("9781234567890");
    }

    @Test
    void fallsBackToReadingOrderWhenTheResponseCarriesNoGeometry() {
        // Losing the text because a response has no bounding boxes would be a
        // far worse failure than losing the layout.
        String text = provider.parseResponse(NO_GEOMETRY);

        assertThat(text).isNotBlank();
        assertThat(text).contains("OIL");
    }

    private static final String DETACHED_COLUMNS = """
            {"responses": [{"fullTextAnnotation": {"text": "fallback", "pages": [{"blocks": [{"blockType": "TEXT", "confidence": 0.98, "paragraphs": [{"words": [{"boundingBox": {"vertices": [{"x": 40, "y": 100}, {"x": 96, "y": 100}, {"x": 96, "y": 114}, {"x": 40, "y": 114}]}, "symbols": [{"text": "S", "property": {}}, {"text": "R", "property": {}}, {"text": "A", "property": {}}, {"text": "/", "property": {}}, {"text": "F", "property": {}}, {"text": "I", "property": {}}, {"text": "X", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 40, "y": 130}, {"x": 104, "y": 130}, {"x": 104, "y": 144}, {"x": 40, "y": 144}]}, "symbols": [{"text": "P", "property": {}}, {"text": "A", "property": {}}, {"text": "I", "property": {}}, {"text": "N", "property": {}}, {"text": "T", "property": {}}, {"text": "I", "property": {}}, {"text": "N", "property": {}}, {"text": "G", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 112, "y": 130}, {"x": 136, "y": 130}, {"x": 136, "y": 144}, {"x": 112, "y": 144}]}, "symbols": [{"text": "J", "property": {}}, {"text": "O", "property": {}}, {"text": "B", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 40, "y": 160}, {"x": 112, "y": 160}, {"x": 112, "y": 174}, {"x": 40, "y": 174}]}, "symbols": [{"text": "D", "property": {}}, {"text": "E", "property": {}}, {"text": "G", "property": {}}, {"text": "R", "property": {}}, {"text": "E", "property": {}}, {"text": "A", "property": {}}, {"text": "S", "property": {}}, {"text": "E", "property": {}}, {"text": "R", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 40, "y": 190}, {"x": 80, "y": 190}, {"x": 80, "y": 204}, {"x": 40, "y": 204}]}, "symbols": [{"text": "W", "property": {}}, {"text": "A", "property": {}}, {"text": "S", "property": {}}, {"text": "T", "property": {}}, {"text": "E", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 96, "y": 190}, {"x": 144, "y": 190}, {"x": 144, "y": 204}, {"x": 96, "y": 204}]}, "symbols": [{"text": "P", "property": {}}, {"text": "A", "property": {}}, {"text": "D", "property": {}}, {"text": "-", "property": {}}, {"text": "B", "property": {}}, {"text": "P", "property": {}}]}]}]}, {"blockType": "TEXT", "confidence": 0.98, "paragraphs": [{"words": [{"boundingBox": {"vertices": [{"x": 420, "y": 100}, {"x": 484, "y": 100}, {"x": 484, "y": 114}, {"x": 420, "y": 114}]}, "symbols": [{"text": "1", "property": {}}, {"text": ",", "property": {}}, {"text": "8", "property": {}}, {"text": "0", "property": {}}, {"text": "0", "property": {}}, {"text": ".", "property": {}}, {"text": "0", "property": {}}, {"text": "0", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 420, "y": 130}, {"x": 484, "y": 130}, {"x": 484, "y": 144}, {"x": 420, "y": 144}]}, "symbols": [{"text": "7", "property": {}}, {"text": ",", "property": {}}, {"text": "6", "property": {}}, {"text": "0", "property": {}}, {"text": "0", "property": {}}, {"text": ".", "property": {}}, {"text": "0", "property": {}}, {"text": "0", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 420, "y": 160}, {"x": 468, "y": 160}, {"x": 468, "y": 174}, {"x": 420, "y": 174}]}, "symbols": [{"text": "3", "property": {}}, {"text": "1", "property": {}}, {"text": "2", "property": {}}, {"text": ".", "property": {}}, {"text": "5", "property": {}}, {"text": "0", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 420, "y": 190}, {"x": 460, "y": 190}, {"x": 460, "y": 204}, {"x": 420, "y": 204}]}, "symbols": [{"text": "2", "property": {}}, {"text": "5", "property": {}}, {"text": ".", "property": {}}, {"text": "0", "property": {}}, {"text": "0", "property": {}}]}]}]}]}]}}]}""";

    private static final String SKEWED_ROWS = """
            {"responses": [{"fullTextAnnotation": {"text": "fallback", "pages": [{"blocks": [{"blockType": "TEXT", "confidence": 0.98, "paragraphs": [{"words": [{"boundingBox": {"vertices": [{"x": 40, "y": 100}, {"x": 112, "y": 100}, {"x": 112, "y": 114}, {"x": 40, "y": 114}]}, "symbols": [{"text": "C", "property": {}}, {"text": "O", "property": {}}, {"text": "N", "property": {}}, {"text": "D", "property": {}}, {"text": "E", "property": {}}, {"text": "N", "property": {}}, {"text": "S", "property": {}}, {"text": "E", "property": {}}, {"text": "R", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 420, "y": 106}, {"x": 468, "y": 106}, {"x": 468, "y": 120}, {"x": 420, "y": 120}]}, "symbols": [{"text": "1", "property": {}}, {"text": "5", "property": {}}, {"text": "0", "property": {}}, {"text": ".", "property": {}}, {"text": "0", "property": {}}, {"text": "0", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 40, "y": 140}, {"x": 96, "y": 140}, {"x": 96, "y": 154}, {"x": 40, "y": 154}]}, "symbols": [{"text": "R", "property": {}}, {"text": "E", "property": {}}, {"text": "P", "property": {}}, {"text": "L", "property": {}}, {"text": "A", "property": {}}, {"text": "C", "property": {}}, {"text": "E", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 112, "y": 143}, {"x": 184, "y": 143}, {"x": 184, "y": 157}, {"x": 112, "y": 157}]}, "symbols": [{"text": "C", "property": {}}, {"text": "O", "property": {}}, {"text": "N", "property": {}}, {"text": "D", "property": {}}, {"text": "E", "property": {}}, {"text": "N", "property": {}}, {"text": "S", "property": {}}, {"text": "E", "property": {}}, {"text": "R", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 420, "y": 148}, {"x": 468, "y": 148}, {"x": 468, "y": 162}, {"x": 420, "y": 162}]}, "symbols": [{"text": "3", "property": {}}, {"text": "5", "property": {}}, {"text": "0", "property": {}}, {"text": ".", "property": {}}, {"text": "0", "property": {}}, {"text": "0", "property": {}}]}]}]}]}]}}]}""";

    private static final String NO_GEOMETRY = """
            {"responses": [{"fullTextAnnotation": {"text": "OIL CHANGE 500.00", "pages": [{"blocks": [{"blockType": "TEXT", "confidence": 0.98, "paragraphs": [{"words": [{"symbols": [{"text": "O", "property": {}}, {"text": "I", "property": {}}, {"text": "L", "property": {"detectedBreak": {"type": "EOL_SURE_SPACE"}}}]}]}]}]}]}}]}""";

    private static final String BARCODE_BESIDE_TEXT = """
            {"responses": [{"fullTextAnnotation": {"text": "fallback", "pages": [{"blocks": [{"blockType": "TEXT", "confidence": 0.98, "paragraphs": [{"words": [{"boundingBox": {"vertices": [{"x": 40, "y": 100}, {"x": 80, "y": 100}, {"x": 80, "y": 114}, {"x": 40, "y": 114}]}, "symbols": [{"text": "T", "property": {}}, {"text": "O", "property": {}}, {"text": "T", "property": {}}, {"text": "A", "property": {}}, {"text": "L", "property": {}}]}, {"boundingBox": {"vertices": [{"x": 420, "y": 100}, {"x": 484, "y": 100}, {"x": 484, "y": 114}, {"x": 420, "y": 114}]}, "symbols": [{"text": "3", "property": {}}, {"text": ",", "property": {}}, {"text": "3", "property": {}}, {"text": "2", "property": {}}, {"text": "5", "property": {}}, {"text": ".", "property": {}}, {"text": "0", "property": {}}, {"text": "0", "property": {}}]}]}]}, {"blockType": "BARCODE", "confidence": 0.98, "paragraphs": [{"words": [{"boundingBox": {"vertices": [{"x": 40, "y": 130}, {"x": 144, "y": 130}, {"x": 144, "y": 144}, {"x": 40, "y": 144}]}, "symbols": [{"text": "9", "property": {}}, {"text": "7", "property": {}}, {"text": "8", "property": {}}, {"text": "1", "property": {}}, {"text": "2", "property": {}}, {"text": "3", "property": {}}, {"text": "4", "property": {}}, {"text": "5", "property": {}}, {"text": "6", "property": {}}, {"text": "7", "property": {}}, {"text": "8", "property": {}}, {"text": "9", "property": {}}, {"text": "0", "property": {}}]}]}]}]}]}}]}""";
}
