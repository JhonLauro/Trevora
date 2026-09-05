package com.trevora.api.features.concern;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The rule this feature exists to protect, asserted rather than trusted.
 *
 * <p>Concern text is the one thing in Trevora the owner states directly. Every
 * other fact is inferred from a document and can be wrong. The moment a concern
 * is run through the classifier or matched against the component vocabulary, it
 * stops being what the owner said and becomes another guess wearing a first-hand
 * account's clothes — which is the failure migration 011 records, where a can of
 * degreaser became brake work.
 *
 * <p>This is a structural test because the rule is structural. There is no input
 * that makes a classifier call visible from the outside; the only way to catch
 * it is to look at what the package is allowed to depend on. A future change
 * that wires a classifier in fails here, with the reason attached.
 */
class ConcernStaysUnclassifiedTest {

    /**
     * Names that would mean a guess has been attached to the owner's words.
     * Both the classifier and the component vocabulary, since attribution is
     * the half that produced the WASTE PAD bug.
     */
    private static final List<String> FORBIDDEN = List.of(
            "ServiceClassificationService",
            "ServiceClassification",
            "ALLOWED_SERVICE_CATEGORIES",
            "ALLOWED_RELATED_COMPONENTS",
            "relatedComponents",
            "serviceCategory",
            "KeywordRule",
            "OpenAI",
            "keywordFallback"
    );

    @Test
    @DisplayName("nothing in the concern feature touches a classifier or the component vocabulary")
    void theConcernPackageDependsOnNoClassifier() {
        List<String> offenders = sourcesIn(Path.of("src/main/java/com/trevora/api/features/concern"))
                .flatMap(file -> {
                    String text = stripComments(read(file));
                    return FORBIDDEN.stream()
                            .filter(text::contains)
                            .map(name -> file.getFileName() + " mentions " + name);
                })
                .toList();

        assertThat(offenders)
                .describedAs("A concern is what the owner said. Classifying it makes it a guess.")
                .isEmpty();
    }

    @Test
    @DisplayName("the mechanic's concern DTO carries words and a date, and no derived field")
    void theMechanicDtoCarriesNothingDerived() {
        String dto = stripComments(read(Path.of(
                "src/main/java/com/trevora/api/features/concern/MechanicConcernResponse.java")));

        assertThat(dto).contains("String note");
        assertThat(dto).contains("Instant noticedAt");
        // No category, no component, no severity, no cause, no linked record.
        FORBIDDEN.forEach(name -> assertThat(dto).doesNotContain(name));
        assertThat(dto).doesNotContain("recordId");
        assertThat(dto).doesNotContain("severity");
    }

    /**
     * Comments go first. These files explain at length why no classifier may
     * touch a concern, and naming the thing you are refusing to call is how
     * that explanation works. The rule is about what the code depends on.
     */
    private static String stripComments(String source) {
        return source.replaceAll("(?s)/\\*.*?\\*/", "").replaceAll("(?m)^\\s*//.*$", "");
    }

    private static Stream<Path> sourcesIn(Path directory) {
        try {
            return Files.walk(directory).filter(path -> path.toString().endsWith(".java")).toList().stream();
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    private static String read(Path path) {
        try {
            return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }
}
