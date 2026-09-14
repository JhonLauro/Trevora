package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * A bent block of priced lines on an otherwise flat page, built rather than
 * captured so the bend is known exactly.
 *
 * <p>The page-wide angle is the median of every word, and the flat rows above
 * and below outnumber the bent ones, so it comes out at zero: the single-angle
 * correction does nothing, as on the Palmetto 57 Nissan repair order. Each line
 * prints its price in three columns far to the right, at 2.8 degrees, which puts
 * a price about a row below its own description.
 */
class PriceColumnBendTest {

    private static final double HEIGHT = 8;
    private static final double BEND_DEGREES = 2.8;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final GoogleVisionOCRProvider provider = new GoogleVisionOCRProvider(objectMapper, "test-key");

    @Test
    void aBentBlockWithPriceColumnsPairsEachDescriptionWithItsPrice() {
        List<String> rows = layout(true);

        assertThat(rowWith(rows, "DONE")).contains("134.27");
        assertThat(rowWith(rows, "ENHANCER")).contains("27.99");
        assertThat(rowWith(rows, "SYN")).contains("77.73");
    }

    @Test
    void withoutRepeatedPricesTheLayoutIsLeftExactlyAsBefore() {
        // One price per row proves no price columns, so nothing is corrected and
        // the drift the single-angle correction cannot see is still there.
        List<String> rows = layout(false);

        assertThat(rowWith(rows, "ENHANCER")).doesNotContain("27.99");
    }

    private List<String> layout(boolean priceColumns) {
        List<Map<String, Object>> words = new ArrayList<>();
        for (int row = 0; row < 4; row++) {
            for (int column = 0; column < 6; column++) {
                words.add(word("FLAT" + row + column, 100 + column * 90, 100 + row * 2 * HEIGHT, 0));
                words.add(word("BASE" + row + column, 100 + column * 90, 520 + row * 2 * HEIGHT, 0));
            }
        }
        String[][] lines = {{"WORK", "DONE", "134.27"}, {"CVT", "ENHANCER", "27.99"}, {"SYN", "CVT", "77.73"}};
        double slope = Math.tan(Math.toRadians(BEND_DEGREES));
        for (int i = 0; i < lines.length; i++) {
            double baseY = 300 + i * 2 * HEIGHT;
            words.add(word(lines[i][0], 150, baseY + (150 - 200) * slope, BEND_DEGREES));
            words.add(word(lines[i][1], 210, baseY + (210 - 200) * slope, BEND_DEGREES));
            double[] columnXs = priceColumns ? new double[] {420, 472, 526} : new double[] {526};
            for (double x : columnXs) {
                words.add(word(lines[i][2], x, baseY + (x - 200) * slope, BEND_DEGREES));
            }
        }
        JsonNode pages = objectMapper.valueToTree(List.of(Map.of("blocks", List.of(Map.of(
                "blockType", "TEXT",
                "paragraphs", List.of(Map.of("words", words)))))));
        return provider.layoutTextFromPages(pages).lines().toList();
    }

    private static String rowWith(List<String> rows, String text) {
        return rows.stream().filter(row -> row.contains(text)).findFirst().orElse("(no row with " + text + ")");
    }

    /** A Vision word: its text and the four corners of a box rotated by {@code degrees}, in printed order. */
    private static Map<String, Object> word(String text, double centreX, double centreY, double degrees) {
        double width = 50;
        double angle = Math.toRadians(degrees);
        double cos = Math.cos(angle);
        double sin = Math.sin(angle);
        double[][] corners = {{-width / 2, -HEIGHT / 2}, {width / 2, -HEIGHT / 2}, {width / 2, HEIGHT / 2}, {-width / 2, HEIGHT / 2}};
        List<Map<String, Object>> vertices = new ArrayList<>();
        for (double[] corner : corners) {
            vertices.add(Map.of(
                    "x", centreX + corner[0] * cos - corner[1] * sin,
                    "y", centreY + corner[0] * sin + corner[1] * cos));
        }
        return Map.of(
                "symbols", List.of(Map.of("text", text)),
                "boundingBox", Map.of("vertices", vertices));
    }
}
