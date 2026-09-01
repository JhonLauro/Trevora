package com.trevora.api.features.serviceinput.golden;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * How a case finds its photograph.
 *
 * <p>Worth its own test because the image layer skips when it cannot find one,
 * and a skip is silent by design. Getting the lookup subtly wrong would look
 * exactly like having no photographs — the run would go green having measured
 * nothing, which is the one outcome this whole set exists to prevent.
 */
class GoldenCaseImageTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @AfterEach
    void clearConfiguredRoot() {
        System.clearProperty("golden.imageDir");
    }

    @Test
    void aCaseWithNoLayerIsTextLayer() {
        GoldenCase textCase = caseWithMeta("{}");

        assertThat(textCase.layer()).isEqualTo("text");
        assertThat(textCase.isImageLayer()).isFalse();
        assertThat(textCase.imageFileName()).isNull();
    }

    @Test
    void findsThePhotographInTheConfiguredFolder(@TempDir Path folder) throws IOException {
        Files.writeString(folder.resolve("tilted-20deg.jpg"), "not really a jpeg");
        System.setProperty("golden.imageDir", folder.toString());

        GoldenCase imageCase = caseWithMeta("""
                {"layer": "image", "imageFile": "tilted-20deg.jpg"}
                """);

        assertThat(imageCase.isImageLayer()).isTrue();
        assertThat(imageCase.imagePath()).isEqualTo(folder.resolve("tilted-20deg.jpg"));
    }

    @Test
    void saysTheFolderIsUnsetRatherThanBlamingTheFile() {
        // Only meaningful on a machine that has not set it. On one that has,
        // skipping is honest; failing would be a test reporting on the
        // developer's shell rather than on the code.
        org.junit.jupiter.api.Assumptions.assumeTrue(System.getenv("GOLDEN_IMAGE_DIR") == null,
                "GOLDEN_IMAGE_DIR is set in this environment.");

        GoldenCase imageCase = caseWithMeta("""
                {"layer": "image", "imageFile": "tilted-20deg.jpg"}
                """);

        assertThat(imageCase.imagePath()).isNull();
        assertThat(imageCase.missingImageReason()).contains("GOLDEN_IMAGE_DIR is not set");
    }

    @Test
    void namesTheMissingFileWhenTheFolderIsSetButEmpty(@TempDir Path folder) {
        System.setProperty("golden.imageDir", folder.toString());

        GoldenCase imageCase = caseWithMeta("""
                {"layer": "image", "imageFile": "tilted-20deg.jpg"}
                """);

        assertThat(imageCase.imagePath()).isNull();
        assertThat(imageCase.missingImageReason())
                .contains("not found")
                .contains("tilted-20deg.jpg");
    }

    private static GoldenCase caseWithMeta(String metaJson) {
        return new GoldenCase("example", "", readTree(metaJson), readTree("{}"));
    }

    private static JsonNode readTree(String json) {
        try {
            return MAPPER.readTree(json);
        } catch (IOException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
