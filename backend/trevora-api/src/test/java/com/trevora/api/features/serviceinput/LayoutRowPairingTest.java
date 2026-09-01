package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Whether a label keeps the amount printed beside it when the page is not
 * square to the camera.
 *
 * <p>This is the failure that motivated the change, reproduced in miniature. A
 * real Toyota repair order photographed flat-on came back with every label
 * carrying the amount from the line above it:
 *
 * <pre>
 *   Total Labor                     (nothing)
 *   Total Part      | 700.00        &lt;- belongs to Total Labor
 *   Total Sublet    | 440.63        &lt;- belongs to Total Part
 *   ...
 *   GRAND TOTAL     | 592.93        &lt;- the VAT
 * </pre>
 *
 * <p>The printed grand total was 5,534.01. Nothing downstream could catch it:
 * 592.93 is a well-formed peso amount sitting under a label that says GRAND
 * TOTAL, and it reconciles against nothing because nothing was checking. The
 * extraction prompt is blameless — the text it received genuinely said that.
 *
 * <p>The geometry here is built rather than captured so the angle is known
 * exactly and the assertion can be about behaviour rather than about one
 * photograph. Two columns, a label column on the left and an amount column far
 * to the right, on a page rotated by a couple of degrees — which is the whole
 * point, because the further apart the two columns are, the more vertical drift
 * a small rotation puts between them.
 */
class LayoutRowPairingTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final GoogleVisionOCRProvider provider =
            new GoogleVisionOCRProvider(objectMapper, "test-key");

    /** Rows of the totals block, as printed. */
    private static final String[][] TOTALS = {
        {"Total-Labor", "700.00"},
        {"Total-Part", "440.63"},
        {"Total-Sublet", "0.00"},
        {"Sub-Total", "4,941.08"},
        {"VAT", "592.93"},
        {"GRAND-TOTAL", "5,534.01"},
    };

    @Test
    void aTiltedPageStillPairsEachLabelWithItsOwnAmount() {
        // Two degrees. Small enough to look flat in a photograph, large enough
        // that across 900px of page the amount column sits a third of a line
        // lower than its label - which is what breaks centre-distance grouping.
        String text = provider.layoutTextFromPages(totalsBlock(Math.toRadians(2.0)));

        assertThat(text.lines()).hasSize(TOTALS.length);
        for (String[] row : TOTALS) {
            assertThat(text)
                    .as("%s must keep its own amount", row[0])
                    .contains(row[0] + " | " + row[1]);
        }
    }

    @Test
    void theSameHoldsWhenTheTiltRunsTheOtherWay() {
        String text = provider.layoutTextFromPages(totalsBlock(Math.toRadians(-2.0)));

        for (String[] row : TOTALS) {
            assertThat(text).contains(row[0] + " | " + row[1]);
        }
    }

    @Test
    void aSquarePageIsUnaffected() {
        String text = provider.layoutTextFromPages(totalsBlock(0));

        for (String[] row : TOTALS) {
            assertThat(text).contains(row[0] + " | " + row[1]);
        }
    }

    @Test
    void theSkewEstimateRecoversTheAngleItWasGiven() {
        for (double degrees : new double[] {-8, -2, 0, 3, 11}) {
            List<GoogleVisionOCRProvider.PositionedWord> words = words(Math.toRadians(degrees));

            assertThat(provider.estimateSkew(words))
                    .as("skew of %.0f degrees", degrees)
                    .isCloseTo(Math.toRadians(degrees), within(0.01));
        }
    }

    @Test
    void anAbsurdAngleIsIgnoredRatherThanApplied() {
        // Rotating by a bad estimate scrambles a page that was merely untidy,
        // so past a plausible tilt the correction declines to act.
        List<GoogleVisionOCRProvider.PositionedWord> words = words(Math.toRadians(70));

        assertThat(provider.estimateSkew(words)).isZero();
    }

    @Test
    void tooFewWordsMeansNoEstimate() {
        List<GoogleVisionOCRProvider.PositionedWord> words =
                words(Math.toRadians(5)).subList(0, 4);

        assertThat(provider.estimateSkew(words)).isZero();
    }

    /** Every word of the totals block, rotated, as the provider would hold it. */
    private List<GoogleVisionOCRProvider.PositionedWord> words(double radians) {
        List<GoogleVisionOCRProvider.PositionedWord> words = new ArrayList<>();
        JsonNode pages = totalsBlock(radians);
        for (JsonNode word : pages.path(0).path("blocks").path(0).path("paragraphs").path(0).path("words")) {
            words.add(toWord(word));
        }
        return words;
    }

    private GoogleVisionOCRProvider.PositionedWord toWord(JsonNode word) {
        StringBuilder text = new StringBuilder();
        word.path("symbols").forEach(symbol -> text.append(symbol.path("text").asText("")));
        JsonNode vertices = word.path("boundingBox").path("vertices");
        double[] xs = new double[4];
        double[] ys = new double[4];
        for (int i = 0; i < 4; i++) {
            xs[i] = vertices.get(i).path("x").asDouble(0);
            ys[i] = vertices.get(i).path("y").asDouble(0);
        }
        double width = Math.hypot(xs[1] - xs[0], ys[1] - ys[0]);
        double height = Math.hypot(xs[3] - xs[0], ys[3] - ys[0]);
        return new GoogleVisionOCRProvider.PositionedWord(
                text.toString(),
                (xs[0] + xs[1] + xs[2] + xs[3]) / 4.0,
                (ys[0] + ys[1] + ys[2] + ys[3]) / 4.0,
                width,
                height,
                Math.atan2(ys[1] - ys[0], xs[1] - xs[0]));
    }

    /**
     * A totals block as Vision would report it: a label at x=100 and an amount
     * at x=1000, six rows 40px apart, the whole thing rotated about the origin.
     */
    private JsonNode totalsBlock(double radians) {
        StringBuilder words = new StringBuilder();
        for (int row = 0; row < TOTALS.length; row++) {
            double y = 100 + row * 40;
            if (row > 0) {
                words.append(",");
            }
            words.append(wordJson(TOTALS[row][0], 100, y, radians)).append(",");
            words.append(wordJson(TOTALS[row][1], 1000, y, radians));
        }
        String json = """
                [
                  {
                    "blocks": [
                      {
                        "blockType": "TEXT",
                        "confidence": 0.99,
                        "paragraphs": [ { "words": [ %s ] } ]
                      }
                    ]
                  }
                ]
                """.formatted(words);
        try {
            return objectMapper.readTree(json);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private String wordJson(String text, double x, double y, double radians) {
        double width = text.length() * 11.0;
        double height = 22.0;
        double cos = Math.cos(radians);
        double sin = Math.sin(radians);

        double[][] corners = {
            {x, y}, {x + width, y}, {x + width, y + height}, {x, y + height},
        };
        StringBuilder vertices = new StringBuilder();
        for (int i = 0; i < corners.length; i++) {
            double rx = corners[i][0] * cos - corners[i][1] * sin;
            double ry = corners[i][0] * sin + corners[i][1] * cos;
            if (i > 0) {
                vertices.append(",");
            }
            vertices.append("{\"x\": %d, \"y\": %d}".formatted(Math.round(rx), Math.round(ry)));
        }

        StringBuilder symbols = new StringBuilder();
        for (int i = 0; i < text.length(); i++) {
            if (i > 0) {
                symbols.append(",");
            }
            symbols.append("{\"text\": \"%s\"}".formatted(text.charAt(i)));
        }

        return "{\"boundingBox\": {\"vertices\": [%s]}, \"symbols\": [%s]}"
                .formatted(vertices, symbols);
    }
}
