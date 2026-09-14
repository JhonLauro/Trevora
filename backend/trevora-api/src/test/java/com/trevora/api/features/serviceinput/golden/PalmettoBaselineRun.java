package com.trevora.api.features.serviceinput.golden;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.serviceinput.GoogleVisionOCRProvider;
import com.trevora.api.features.serviceinput.OCRProcessingService;
import com.trevora.api.features.serviceinput.OpenAIServiceDraftExtractionProvider;
import com.trevora.api.features.serviceinput.ReceiptExtractionResult;
import com.trevora.api.features.serviceinput.ServiceClassificationService;
import com.trevora.api.features.serviceinput.ServiceItemFields;
import com.trevora.api.features.serviceinput.ServiceLineEntryFields;
import com.trevora.api.features.serviceinput.VehicleContext;
import com.trevora.api.shared.http.OutboundHttp;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.client.RestClient;

/**
 * TEMPORARY MEASUREMENT HARNESS - not a test, not for committing.
 *
 * <p>Runs the Palmetto 57 Nissan receipt through the current production pipeline
 * (Google Vision, layout reconstruction, extraction prompt, date and odometer
 * resolvers) N times and reports what each run returned, so a later change can
 * be judged against a measured baseline rather than two anecdotes. Changes no
 * production code.
 *
 * <p>Also saves one raw Vision response, so layout work can be developed and
 * re-run offline without paying for Vision again.
 *
 * <pre>
 *   ./mvnw test -Pgolden-image "-Dtest=PalmettoBaselineRun"
 *   ./mvnw test -Pgolden-image "-Dtest=PalmettoBaselineRun" "-Dbaseline.runs=5" "-Dbaseline.image=C:/path/receipt.jpg"
 * </pre>
 *
 * <p>Keys are read from the environment, falling back to {@code .env} in the
 * working directory. They are never printed. Cost: one Vision call per run, one
 * extra for the raw response, and one OpenAI extraction per run.
 */
@Tag("golden-image")
class PalmettoBaselineRun {

    private static final String DEFAULT_IMAGE =
            "C:/Users/ADMINI~1/AppData/Local/Temp/claude/C--Users-Administrator-Trevora/"
                    + "39e54417-1f09-485b-aa3d-da604daa80f1/scratchpad/palmetto-upload-q85.jpg";

    @Test
    void baseline() throws Exception {
        Map<String, String> env = dotEnv(Path.of(".env"));
        String openAiKey = setting("OPENAI_API_KEY", env);
        String visionKey = setting("GOOGLE_CLOUD_VISION_API_KEY", env);
        assumeTrue(openAiKey != null, "OPENAI_API_KEY not found in the environment or .env");
        assumeTrue(visionKey != null, "GOOGLE_CLOUD_VISION_API_KEY not found in the environment or .env");

        // The production default, not the golden harness's older gpt-4o-mini fallback.
        String model = setting("OPENAI_MODEL", env) == null ? "gpt-5.4-mini" : setting("OPENAI_MODEL", env);
        int runs = Integer.getInteger("baseline.runs", 5);
        Path image = Path.of(System.getProperty("baseline.image", DEFAULT_IMAGE));
        assumeTrue(Files.isReadable(image), "Receipt image not readable: " + image);

        Path out = Path.of("target", "palmetto-baseline");
        Files.createDirectories(out);
        byte[] bytes = Files.readAllBytes(image);

        StringBuilder summary = new StringBuilder();
        line(summary, "PALMETTO 57 NISSAN BASELINE");
        line(summary, "image: " + image + " (" + bytes.length + " bytes)");
        line(summary, "model: " + model + "   runs: " + runs);

        // One raw Vision response, saved for offline layout work (question 3).
        String raw = rawVision(visionKey, bytes);
        Files.writeString(out.resolve("vision-raw.json"), raw, StandardCharsets.UTF_8);
        line(summary, "raw Vision response saved: " + out.resolve("vision-raw.json").toAbsolutePath());

        OCRProcessingService pipeline = new OCRProcessingService(
                new GoogleVisionOCRProvider(new ObjectMapper(), visionKey),
                new OpenAIServiceDraftExtractionProvider(new ObjectMapper(), openAiKey, model),
                new ServiceClassificationService(),
                "google-vision", "openai", 10, 10L * 1024 * 1024);
        VehicleContext nissan = new VehicleContext(
                VehicleContext.vehicleClassFor("suv"), "suv", "Nissan", "Rogue", 2020, null, null);

        String firstOcrHash = null;
        for (int run = 1; run <= runs; run++) {
            MockMultipartFile file = new MockMultipartFile(
                    "receiptImages", image.getFileName().toString(), "image/jpeg", bytes);
            ReceiptExtractionResult result = pipeline.extractReceiptFields(List.of(file), "UPLOAD", nissan);

            String ocr = String.valueOf(result.fieldMetadata() == null ? "" : result.fieldMetadata().get("rawOcrText"));
            Files.writeString(out.resolve("run" + run + "-ocr.txt"), ocr, StandardCharsets.UTF_8);
            String hash = sha(ocr);
            if (firstOcrHash == null) {
                firstOcrHash = hash;
            }

            line(summary, "");
            line(summary, "=== RUN " + run + " ===");
            line(summary, "OCR text sha " + hash.substring(0, 12)
                    + (hash.equals(firstOcrHash) ? "  (identical to run 1)" : "  (DIFFERS from run 1)"));
            Object fallback = result.fieldMetadata() == null ? null : result.fieldMetadata().get("fallbackUsed");
            if (Boolean.TRUE.equals(fallback)) {
                line(summary, "EXTRACTION FELL BACK: " + result.fieldMetadata().get("extractionErrors"));
                continue;
            }
            line(summary, "date=" + result.serviceDate() + "  odometer=" + result.odometer()
                    + "  total=" + result.totalCost());

            int lineCount = 0;
            for (ServiceItemFields service : result.services() == null ? List.<ServiceItemFields>of() : result.services()) {
                line(summary, "  service: " + service.serviceType() + "   lineCost=" + service.lineCost());
                for (ServiceLineEntryFields entry : service.lineEntriesOrEmpty()) {
                    lineCount++;
                    line(summary, String.format(Locale.ROOT, "    %-9s | %-38s | %-14s | %s",
                            entry.kind(), entry.description(), entry.partCode(), entry.lineTotal()));
                }
            }
            line(summary, "  lines returned: " + lineCount);
            checks(result, summary);

            Object warnings = result.fieldMetadata() == null ? null : result.fieldMetadata().get("warnings");
            line(summary, "  warnings: " + warnings);
        }

        Files.writeString(out.resolve("summary.txt"), summary.toString(), StandardCharsets.UTF_8);
        System.out.println(summary);
        System.out.println("Everything above is also in " + out.toAbsolutePath());
    }

    /** What the paper actually says, checked per run. */
    private static void checks(ReceiptExtractionResult result, StringBuilder summary) {
        List<ServiceLineEntryFields> lines = result.services() == null ? List.of()
                : result.services().stream().flatMap(s -> s.lineEntriesOrEmpty().stream()).toList();
        Map<String, Boolean> checks = new LinkedHashMap<>();
        checks.put("labour 134.27 on an OPERATION line",
                lines.stream().anyMatch(l -> "OPERATION".equals(l.kind()) && amount(l, "134.27")));
        checks.put("CVT ENHANCER present", lines.stream().anyMatch(l -> has(l, "ENHANCER")));
        checks.put("CVT ENHANCER = 27.99", lines.stream().anyMatch(l -> has(l, "ENHANCER") && amount(l, "27.99")));
        checks.put("SYN/CVT 5QT present", lines.stream().anyMatch(l -> has(l, "SYN")));
        checks.put("SYN/CVT 5QT = 77.73", lines.stream().anyMatch(l -> has(l, "SYN") && amount(l, "77.73")));
        checks.put("MULTI POINT INSPECTION present", lines.stream().anyMatch(l -> has(l, "MULTI POINT")));
        checks.put("TIRE CONDITION present", lines.stream().anyMatch(l -> has(l, "TIRE")));
        checks.put("no invented TRANSMISSION FLUID line", lines.stream().noneMatch(l -> has(l, "TRANSMISSION FLUID")
                && !has(l, "SERVICE") && !has(l, "PERFORM")));
        checks.put("odometer = 66426", Integer.valueOf(66426).equals(result.odometer()));
        checks.forEach((name, ok) -> line(summary, "  [" + (ok ? "ok" : "XX") + "] " + name));
    }

    private static boolean has(ServiceLineEntryFields line, String text) {
        String description = line.description() == null ? "" : line.description().toUpperCase(Locale.ROOT);
        return description.replaceAll("\\s+", " ").replace(" / ", "/").contains(text);
    }

    private static boolean amount(ServiceLineEntryFields line, String value) {
        return line.lineTotal() != null && line.lineTotal().compareTo(new BigDecimal(value)) == 0;
    }

    private static String rawVision(String visionKey, byte[] bytes) {
        Map<String, Object> request = Map.of("requests", List.of(Map.of(
                "image", Map.of("content", Base64.getEncoder().encodeToString(bytes)),
                "features", List.of(Map.of("type", "DOCUMENT_TEXT_DETECTION")),
                "imageContext", Map.of("languageHints", List.of("en", "fil")))));
        RestClient client = OutboundHttp.restClient(OutboundHttp.VISION_READ_TIMEOUT);
        return client.post()
                .uri("https://vision.googleapis.com/v1/images:annotate?key=" + visionKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(String.class);
    }

    private static String setting(String name, Map<String, String> env) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            value = env.get(name);
        }
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static Map<String, String> dotEnv(Path file) throws IOException {
        Map<String, String> values = new LinkedHashMap<>();
        if (!Files.isReadable(file)) {
            return values;
        }
        for (String raw : Files.readAllLines(file, StandardCharsets.UTF_8)) {
            String entry = raw.trim();
            if (entry.isEmpty() || entry.startsWith("#") || !entry.contains("=")) {
                continue;
            }
            String key = entry.substring(0, entry.indexOf('=')).trim().replaceFirst("^export\\s+", "");
            String value = entry.substring(entry.indexOf('=') + 1).trim();
            if (value.length() >= 2 && (value.startsWith("\"") && value.endsWith("\"")
                    || value.startsWith("'") && value.endsWith("'"))) {
                value = value.substring(1, value.length() - 1);
            }
            values.put(key, value);
        }
        return values;
    }

    private static String sha(String text) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
    }

    private static void line(StringBuilder builder, String text) {
        builder.append(text).append(System.lineSeparator());
    }
}
