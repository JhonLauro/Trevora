package com.trevora.api.features.serviceinput.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.serviceinput.VehicleContext;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
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
