package com.trevora.api.features.serviceinput.golden;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.serviceinput.GoogleVisionOCRProvider;
import com.trevora.api.features.serviceinput.OCRProcessingService;
import com.trevora.api.features.serviceinput.OpenAIServiceDraftExtractionProvider;
import com.trevora.api.features.serviceinput.ReceiptDraftFields;
import com.trevora.api.features.serviceinput.ReceiptExtractionResult;
import com.trevora.api.features.serviceinput.ServiceClassificationService;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/**
 * Runs the golden set from the photograph rather than from committed OCR text.
 *
 * <p><b>Why this exists.</b> {@link GoldenExtractionTest} starts at
 * {@code ocr.txt} and so can only ever score the extraction prompt. Every
 * capture problem — a receipt photographed at an angle, a curled thermal slip,
 * glare across the totals — happens one layer below that, and until now nothing
 * in this project measured it. Skew in particular is not a prompt problem at
 * all: a row spanning the page drifts vertically further than the row tolerance
 * in {@code GoogleVisionOCRProvider.layoutTextFromPages} allows, the row
 * splits, and the price column lands on lines of its own. The prompt then
 * receives text that genuinely does not say which price belongs to which line,
 * and answers accordingly.
 *
 * <p>So this runs the real thing end to end: photograph, Google Vision, the
 * layout reconstruction, the extraction prompt, the keyword fallback. Same
 * scorer as the text layer, so the two are comparable, plus
 * {@link OcrStabilityReport} on the text Vision returned.
 *
 * <p><b>It asserts no floors.</b> The text layer's floors came from a measured
 * baseline that held across four code states; this layer has no baseline yet,
 * and a floor invented before the first run is a number someone made up. Take
 * one from the first clean run, then add floors in the same commit that says
 * what they were measured from.
 *
 * <pre>
 *   GOLDEN_IMAGE_DIR=/path/to/receipt-photos ./mvnw test -Pgolden-image
 *   ./mvnw test -Pgolden-image -Dgolden.imageDir=C:/receipts -Dgolden.runs=5
 * </pre>
 *
 * <p>Needs {@code GOOGLE_CLOUD_VISION_API_KEY} and {@code OPENAI_API_KEY}, and
 * skips rather than fails without them. Every repeat costs a Vision call and an
 * OpenAI call per case, so this is dearer than the text layer and is a separate
 * profile for that reason.
 */
@Tag("golden-image")
class GoldenImageTest {

    private static final int DEFAULT_RUNS = 3;

    @Test
    void scoreGoldenSetFromImages() {
        String openAiKey = System.getenv("OPENAI_API_KEY");
        String visionKey = System.getenv("GOOGLE_CLOUD_VISION_API_KEY");
        assumeTrue(openAiKey != null && !openAiKey.isBlank(),
                "OPENAI_API_KEY is not set — skipping the image layer rather than failing.");
        assumeTrue(visionKey != null && !visionKey.isBlank(),
                "GOOGLE_CLOUD_VISION_API_KEY is not set — skipping the image layer rather than failing.");

        int runs = Integer.getInteger("golden.runs", DEFAULT_RUNS);
        // -Dgolden.dump=true prints what the model actually returned. The score
        // says a field is wrong; this says how. Three prompt changes were made
        // chasing an empty lineEntries array by reasoning from scores alone, and
        // two of them were wrong - the output was there to be read the whole time.
        boolean dump = Boolean.getBoolean("golden.dump");
        String model = System.getenv().getOrDefault("OPENAI_MODEL", "gpt-4o-mini");

        GoogleVisionOCRProvider vision = new GoogleVisionOCRProvider(new ObjectMapper(), visionKey);
        OpenAIServiceDraftExtractionProvider extraction =
                new OpenAIServiceDraftExtractionProvider(new ObjectMapper(), openAiKey, model);
        ServiceClassificationService classificationService = new ServiceClassificationService();
        // The real service, wired the way production wires it. A multi-document
        // upload is extracted one document at a time and merged, and that
        // decision lives inside this class - a test that reimplemented the loop
        // would measure the copy rather than the pipeline.
        OCRProcessingService pipeline = new OCRProcessingService(
                vision, extraction, classificationService,
                "google-vision", "openai", 10, 10L * 1024 * 1024);

        GoldenReport report = new GoldenReport();
        OcrStabilityReport ocrReport = new OcrStabilityReport();
        List<GoldenCase> runnable = new ArrayList<>();

        for (GoldenCase goldenCase : GoldenCase.loadAll()) {
            if (!goldenCase.isImageLayer() && goldenCase.imageFileName() == null) {
                // A text-layer case with no photograph is not a gap, it is a
                // case that was never meant to run here. Silent by design.
                continue;
            }
            if (goldenCase.imagePaths().isEmpty()) {
                ocrReport.recordSkip(goldenCase.id(), goldenCase.missingImageReason());
                continue;
            }
            runnable.add(goldenCase);
        }

        if (runnable.isEmpty()) {
            System.out.println(ocrReport.render());
        }
        assumeTrue(!runnable.isEmpty(),
                "No image-layer case has a readable photograph. Point GOLDEN_IMAGE_DIR at the folder"
                        + " holding them — photographs are deliberately not in this repository.");

        Path dumpDir = Path.of("target", "golden-ocr");
        for (GoldenCase goldenCase : runnable) {
            if (!goldenCase.gatesFloors()) {
                report.markAdvisory(goldenCase.id());
            }
            List<MockMultipartFile> files = new ArrayList<>();
            goldenCase.imagePaths().forEach(path -> files.add(multipart(path)));

            for (int run = 0; run < runs; run++) {
                ReceiptExtractionResult result;
                try {
                    result = pipeline.extractReceiptFields(
                            List.copyOf(files), "UPLOAD", goldenCase.vehicleContext());
                } catch (RuntimeException exception) {
                    report.recordFailure(goldenCase.id(), exception.getMessage());
                    continue;
                }
                String ocrText = rawOcrText(result);
                ocrReport.record(goldenCase.id(), ocrText);
                // Every run's text goes to disk. The scores say a field is
                // wrong; only the text says whether the value was ever there to
                // read, and on a skew problem that is the entire diagnosis.
                dump(dumpDir, goldenCase.id() + "-run" + (run + 1) + ".txt", ocrText);

                if (ocrText == null || ocrText.isBlank()) {
                    report.recordFailure(goldenCase.id(), "OCR returned empty text");
                    continue;
                }

                // A failed extraction does not throw: the pipeline catches it,
                // falls back to the raw OCR text and returns a draft full of
                // nulls. Scored naively that is indistinguishable from a
                // document nothing could be read off, and a total collapse on
                // the longest case in the set was read as ordinary zeros for
                // several runs. The metadata says which it was, so read it.
                String fallback = fallbackReason(result);
                if (fallback != null) {
                    report.recordFailure(goldenCase.id(), fallback);
                    continue;
                }

                ReceiptDraftFields extracted = asDraftFields(result);

                // The components the pipeline already settled on, read back out
                // of the metadata rather than recomputed. Production stores this
                // answer; scoring a second, differently-derived one would
                // measure a value no owner ever sees.
                report.record(goldenCase.id(), GoldenScorer.score(
                        goldenCase, extracted, new LinkedHashSet<>(storedComponents(result))));
                if (dump && run == 0) {
                    dumpLines(goldenCase.id(), extracted);
                }
            }
        }

        System.out.println(ocrReport.render());
        System.out.println(report.render(runs));
        System.out.println("  OCR text for every run: " + dumpDir.toAbsolutePath());

        // Same rule as the text layer: one unusable extraction is a bad roll,
        // a quarter of them is something broken.
        if (report.attempts() > 0 && report.failures().size() * 4 > report.attempts()) {
            throw new AssertionError(report.failures().size() + " of " + report.attempts()
                    + " image runs produced nothing. That is a fault, not flakiness:\n  "
                    + String.join("\n  ", report.failures()));
        }
    }

    private static void dumpLines(String caseId, ReceiptDraftFields extracted) {
        System.out.println(System.lineSeparator() + "--- " + caseId + " : what the model returned ---");
        System.out.println("  documentType: " + extracted.documentType());
        if (extracted.services() == null || extracted.services().isEmpty()) {
            System.out.println("  (no services returned - line entries have nowhere to live)");
            return;
        }
        extracted.services().forEach(service -> {
            System.out.println("  service: " + service.serviceType() + "  lineCost=" + service.lineCost());
            service.lineEntriesOrEmpty().forEach(entry ->
                    System.out.println("      " + entry.kind() + "  " + entry.description()
                            + "  qty=" + entry.quantity() + "  total=" + entry.lineTotal()));
        });
    }

    /**
     * Why this extraction fell back to raw OCR, or null when it did not.
     *
     * <p>The pipeline records both the fact and the reason and then returns a
     * perfectly well-formed draft with nothing in it. Without this the report
     * cannot tell "the model could not read this receipt" from "the request
     * never completed", and those want completely different fixes.
     */
    private static String fallbackReason(ReceiptExtractionResult result) {
        java.util.Map<String, Object> metadata = result.fieldMetadata();
        if (metadata == null || !Boolean.TRUE.equals(metadata.get("fallbackUsed"))) {
            return null;
        }
        Object errors = metadata.get("extractionErrors");
        String detail = errors instanceof List<?> list && !list.isEmpty()
                ? String.join("; ", list.stream().map(String::valueOf).toList())
                : "no reason recorded";
        return "fell back to raw OCR - " + detail;
    }

    /** The OCR text of every page the pipeline read, as it stores it. */
    private static String rawOcrText(ReceiptExtractionResult result) {
        Object text = result.fieldMetadata() == null ? null : result.fieldMetadata().get("rawOcrText");
        return text instanceof String value ? value : "";
    }

    /** The related components the pipeline settled on and would have stored. */
    @SuppressWarnings("unchecked")
    private static List<String> storedComponents(ReceiptExtractionResult result) {
        Object classification = result.fieldMetadata() == null
                ? null
                : result.fieldMetadata().get("classification");
        if (!(classification instanceof java.util.Map<?, ?> map)) {
            return List.of();
        }
        Object components = map.get("relatedComponents");
        return components instanceof List<?> list ? (List<String>) list : List.of();
    }

    /**
     * The pipeline's answer in the shape the scorer reads.
     *
     * <p>{@link ReceiptExtractionResult} is what production hands to the draft
     * and carries only the fields a draft keeps; the scorer was written against
     * {@link ReceiptDraftFields}. Nothing is invented here - the missing fields
     * are evidence and warnings, which the image layer does not score.
     */
    private static ReceiptDraftFields asDraftFields(ReceiptExtractionResult result) {
        return new ReceiptDraftFields(
                result.documentType(),
                null,
                List.of(),
                result.serviceDate(),
                result.services() == null ? List.of() : result.services(),
                result.odometer(),
                result.totalCost(),
                result.shopName(),
                result.location(),
                result.remarks(),
                List.of(),
                java.util.Map.of(),
                java.util.Map.of(),
                List.of(),
                null,
                List.of());
    }

    private static MockMultipartFile multipart(Path path) {
        try {
            return new MockMultipartFile(
                    "receiptImage",
                    path.getFileName().toString(),
                    contentType(path),
                    Files.readAllBytes(path));
        } catch (IOException exception) {
            throw new UncheckedIOException("Could not read golden image " + path, exception);
        }
    }

    private static String contentType(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".png")) {
            return "image/png";
        }
        if (name.endsWith(".pdf")) {
            return "application/pdf";
        }
        return "image/jpeg";
    }

    private static void dump(Path directory, String fileName, String text) {
        try {
            Files.createDirectories(directory);
            Files.writeString(directory.resolve(fileName), text == null ? "" : text, StandardCharsets.UTF_8);
        } catch (IOException exception) {
            // Losing the dump must not lose the run that paid for it.
            System.out.println("  (could not write " + fileName + ": " + exception.getMessage() + ")");
        }
    }

}
