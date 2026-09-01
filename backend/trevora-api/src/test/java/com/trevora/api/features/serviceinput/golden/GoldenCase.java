package com.trevora.api.features.serviceinput.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.serviceinput.VehicleContext;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * One receipt in the golden set: its OCR text, what it is, and the correct
 * answer.
 *
 * <p>Loaded from the classpath rather than the filesystem so the set travels
 * with the test jar and works the same from an IDE and from Maven.
 */
public record GoldenCase(
        String id,
        String ocrText,
        JsonNode meta,
        JsonNode expected
) {
    private static final String ROOT = "golden/";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * Where the receipt photographs live.
     *
     * <p>They are not in this directory and never will be: they are
     * photographs of real customers' receipts, and this repository is going to
     * be submitted and archived. The OCR text can be redacted and committed; a
     * photograph cannot be redacted at all.
     *
     * <p>So the image layer reads them from a folder outside the repository,
     * named by {@code GOLDEN_IMAGE_DIR} (or {@code -Dgolden.imageDir}). A
     * checkout without that folder still runs the text layer in full and skips
     * the image cases, which is the honest outcome — it has no images.
     */
    private static final String IMAGE_DIR_ENV = "GOLDEN_IMAGE_DIR";
    private static final String IMAGE_DIR_PROPERTY = "golden.imageDir";

    /** Every case directory listed in {@code golden/cases.txt}, in file order. */
    public static List<GoldenCase> loadAll() {
        List<GoldenCase> cases = new ArrayList<>();
        for (String id : readLines(ROOT + "cases.txt")) {
            cases.add(load(id));
        }
        return cases;
    }

    public static GoldenCase load(String id) {
        return new GoldenCase(
                id,
                readString(ROOT + id + "/ocr.txt"),
                readJson(ROOT + id + "/case.json"),
                readJson(ROOT + id + "/expected.json")
        );
    }

    /**
     * Fields whose correct answer has not been checked against the original
     * receipt yet. The scorer skips these and reports them separately, so a
     * half-finished case is usable rather than misleading.
     */
    public List<String> pendingGroundTruth() {
        List<String> pending = new ArrayList<>();
        JsonNode node = meta.path("pendingGroundTruth");
        if (node.isArray()) {
            node.forEach(entry -> pending.add(entry.asText()));
        }
        return pending;
    }

    /**
     * The vehicle this receipt belongs to, as the extractor receives it.
     *
     * <p>Recorded per case rather than derived, because a receipt only means
     * something against a vehicle: the same "CVT" line is a transmission
     * service on the Vios and a drive service on the Click, and the set has to
     * be able to say which it expects.
     */
    public VehicleContext vehicleContext() {
        JsonNode vehicle = meta.path("vehicle");
        if (vehicle.isMissingNode() || vehicle.isNull()) {
            return VehicleContext.UNKNOWN;
        }
        String bodyType = text(vehicle.path("bodyType"));
        return new VehicleContext(
                VehicleContext.vehicleClassFor(bodyType),
                bodyType,
                text(vehicle.path("make")),
                text(vehicle.path("model")),
                integer(vehicle.path("modelYear")),
                integer(vehicle.path("lastKnownOdometer")),
                text(vehicle.path("plateNumber"))
        );
    }

    /**
     * Which half of the pipeline this case exercises.
     *
     * <p>{@code text} starts at the committed OCR text and scores the
     * extraction prompt. {@code image} starts at the photograph and scores
     * OCR and extraction together, which is the only way a capture problem —
     * skew, glare, a curled thermal slip — is visible at all.
     */
    public String layer() {
        return meta.path("layer").asText("text");
    }

    public boolean isImageLayer() {
        return "image".equalsIgnoreCase(layer());
    }

    /**
     * The photograph's file name within {@link #IMAGE_DIR_ENV}, or null when
     * the case declares none.
     *
     * <p>A bare file name rather than a path: the folder moves between
     * machines, the file name does not.
     */
    public String imageFileName() {
        List<String> names = imageFileNames();
        return names.isEmpty() ? null : names.get(0);
    }

    /**
     * Every photograph this case is made of, in upload order.
     *
     * <p>A case used to be one image, which quietly assumed an upload is one
     * document. The visit that motivated all of this is five: a repair order, a
     * service invoice, an official receipt, a picking slip and a job card,
     * photographed together. Extracting them one at a time and merging is the
     * production path for such an upload, and a set that can only hand over a
     * single image cannot measure it at all.
     *
     * <p>Reads {@code imageFiles} when present, falling back to the singular
     * {@code imageFile} so the cases written before this keep working unchanged.
     */
    public List<String> imageFileNames() {
        JsonNode many = meta.path("imageFiles");
        if (many.isArray()) {
            List<String> names = new ArrayList<>();
            many.forEach(entry -> {
                String name = text(entry);
                if (name != null) {
                    names.add(name);
                }
            });
            return names;
        }
        String single = text(meta.path("imageFile"));
        return single == null ? List.of() : List.of(single);
    }

    /**
     * The photograph on disk, or null when there is nothing to read — no image
     * declared, no folder configured, or the folder does not have this file.
     *
     * <p>All three are the same outcome for the caller (skip the case) but not
     * the same situation for the person running it, so
     * {@link #missingImageReason()} says which it was.
     */
    public Path imagePath() {
        List<Path> paths = imagePaths();
        return paths.isEmpty() ? null : paths.get(0);
    }

    /**
     * Every photograph on disk, or empty when any of them is missing.
     *
     * <p>All or nothing on purpose: a multi-document case scored from three of
     * its five sheets is not a weaker version of the case, it is a different
     * one, and it would report a merge that never had the documents it was
     * meant to choose between.
     */
    public List<Path> imagePaths() {
        List<String> names = imageFileNames();
        Path root = imageRoot();
        if (names.isEmpty() || root == null) {
            return List.of();
        }
        List<Path> paths = new ArrayList<>();
        for (String name : names) {
            Path candidate = root.resolve(name);
            if (!Files.isRegularFile(candidate)) {
                return List.of();
            }
            paths.add(candidate);
        }
        return List.copyOf(paths);
    }

    /** Why {@link #imagePath()} came back null, phrased for a build log. */
    public String missingImageReason() {
        List<String> names = imageFileNames();
        if (names.isEmpty()) {
            return "case.json declares no imageFile or imageFiles";
        }
        Path root = imageRoot();
        if (root == null) {
            return IMAGE_DIR_ENV + " is not set";
        }
        for (String name : names) {
            Path candidate = root.resolve(name);
            if (!Files.isRegularFile(candidate)) {
                return "not found: " + candidate;
            }
        }
        return "no photograph available";
    }

    /** The configured photo folder, or null when none is set. */
    public static Path imageRoot() {
        String configured = System.getProperty(IMAGE_DIR_PROPERTY);
        if (configured == null || configured.isBlank()) {
            configured = System.getenv(IMAGE_DIR_ENV);
        }
        if (configured == null || configured.isBlank()) {
            return null;
        }
        return Path.of(configured.trim());
    }

    /**
     * Whether this case has OCR text to score yet.
     *
     * <p>An image-layer case is written before its photograph has been through
     * Vision: the ground truth is read off the paper, and the OCR text arrives
     * from the first run. Until then {@code ocr.txt} is a placeholder, and
     * running the text layer over it would spend an API call to score a note to
     * the reader.
     *
     * <p>Deliberately not solved by hand-transcribing the receipt into
     * {@code ocr.txt}. Text written by a person has no character errors, no
     * dropped glyphs and no column drift, so it would flatter the extractor and
     * quietly turn a real capture into a synthetic one.
     */
    public boolean hasOcrText() {
        String text = ocrText == null ? "" : ocrText.trim();
        return !text.isEmpty() && !text.startsWith("(awaiting") && !text.startsWith("(placeholder");
    }

    /**
     * Whether this case's scores are allowed to break the build.
     *
     * <p>The floors in {@link GoldenReport} are a mean across every case, so a
     * new case does not just add a row to the report - it redefines what every
     * floor means. Six Talisay cases joined at once and took {@code lineKinds}
     * from 90%-plus to 62% without a single existing case scoring worse, which
     * would have read as a regression in a build log and was nothing of the
     * kind.
     *
     * <p>So a case gates the floors only once someone has watched its numbers
     * and said so. New cases start advisory: scored, printed, and unable to
     * fail the build. The alternative - lowering the floors to fit whatever the
     * enlarged set scores - is the exact move the floors exist to prevent, and
     * would have quietly given away the guard that caught the 100%-to-36%
     * line-kind regression.
     *
     * <p>Defaults to true, so the cases that predate this flag keep gating
     * exactly as they did.
     */
    public boolean gatesFloors() {
        return meta.path("floorBaseline").asBoolean(true);
    }

    /** True for cases written by hand rather than captured from a real receipt. */
    public boolean isSynthetic() {
        return meta.path("synthetic").asBoolean(false);
    }

    private static String text(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        String value = node.asText();
        return value.isBlank() ? null : value;
    }

    private static Integer integer(JsonNode node) {
        return node.isMissingNode() || node.isNull() ? null : node.asInt();
    }

    private static void appendIfPresent(StringBuilder builder, String label, JsonNode value) {
        if (value.isMissingNode() || value.isNull()) {
            return;
        }
        builder.append(label).append(": ").append(value.asText()).append('\n');
    }

    private static List<String> readLines(String resource) {
        List<String> lines = new ArrayList<>();
        for (String line : readString(resource).split("\\R")) {
            String trimmed = line.trim();
            if (!trimmed.isEmpty() && !trimmed.startsWith("#")) {
                lines.add(trimmed);
            }
        }
        return lines;
    }

    private static String readString(String resource) {
        try (InputStream stream = GoldenCase.class.getClassLoader().getResourceAsStream(resource)) {
            if (stream == null) {
                throw new IllegalStateException("Golden set resource not found: " + resource);
            }
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new UncheckedIOException("Could not read " + resource, exception);
        }
    }

    private static JsonNode readJson(String resource) {
        try {
            return MAPPER.readTree(readString(resource));
        } catch (IOException exception) {
            throw new UncheckedIOException("Could not parse " + resource, exception);
        }
    }
}
