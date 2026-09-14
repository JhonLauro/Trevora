package com.trevora.api.features.serviceinput;

import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/**
 * Replays a saved Google Vision reading through our layout code and, only when
 * asked, through the extraction model, scoring every run against a confirmed
 * answer key.
 *
 * <pre>
 *   ./mvnw test -Preplay                               free: layout only, no API calls
 *   ./mvnw test -Preplay "-Dreplay.model-runs=5"       paid: 5 OpenAI extractions
 * </pre>
 *
 * <p><b>Free by default.</b> The layout replay reads a local file and calls
 * nothing, so a layout change can be measured as often as it is edited. Model
 * runs cost one OpenAI extraction each and happen only when
 * {@code replay.model-runs} is set; Vision is never called again.
 *
 * <p><b>Two kinds of stability, reported apart.</b> Every model run is given
 * byte-identical OCR text, so any difference between runs is the model's. The
 * OCR text itself is compared with the reading taken on 2026-09-13, so a layout
 * change shows up as changed text before any model run. Keeping the two apart
 * is what showed the Palmetto drift was ambiguity our rows create and the model
 * resolves differently each time.
 *
 * <p><b>The data stays out of the repository.</b> The saved reading, the image
 * and the full OCR text are a real person's receipt, found online with details
 * only partly redacted. They live in {@code ~/trevora-replay/palmetto/} (or
 * {@code -Dreplay.dir}); only the answer key, which holds no personal details,
 * is committed. Reports are written under {@code target/replay/}.
 */
@Tag("replay")
class ReceiptReplayTest {

    private static final String ANSWER_KEY = "replay/palmetto-answer-key.json";

    @Test
    void replay() throws Exception {
        Path dir = Path.of(System.getProperty("replay.dir",
                System.getProperty("user.home") + "/trevora-replay/palmetto"));
        Path raw = dir.resolve("vision-raw.json");
        assumeTrue(Files.isReadable(raw), "No saved Vision reading at " + raw);

        ReplayScorer.AnswerKey key = ReplayScorer.load(ANSWER_KEY);
        Path out = Path.of("target", "replay", dir.getFileName().toString());
        Files.createDirectories(out);
        StringBuilder report = new StringBuilder();
        line(report, "REPLAY - " + key.receipt());
        line(report, "answer key confirmed by " + key.confirmedBy());

        // ------------------------------------------------------------ layout, free
        String layout = new GoogleVisionOCRProvider(new ObjectMapper(), "replay-never-calls-vision")
                .parseResponse(Files.readString(raw, StandardCharsets.UTF_8));
        Files.writeString(out.resolve("ocr.txt"), layout, StandardCharsets.UTF_8);
        line(report, "");
        line(report, "OCR TEXT (our layout code, run now)");
        line(report, "  sha " + sha(layout).substring(0, 12) + ", " + layout.lines().count() + " rows");
        Path baseline = dir.resolve("baseline-ocr-2026-09-13.txt");
        if (Files.isReadable(baseline)) {
            List<String> before = withoutPageHeader(Files.readAllLines(baseline, StandardCharsets.UTF_8));
            List<String> now = layout.lines().toList();
            long changed = changedRows(before, now);
            line(report, changed == 0
                    ? "  identical to the 2026-09-13 reading: layout code has not changed this receipt's text"
                    : "  CHANGED from the 2026-09-13 reading: " + changed + " row(s) differ");
        }
        line(report, "");
        line(report, "LAYOUT PAIRS (does one OCR row hold the line's text and its price?)");
        int paired = 0;
        List<ReplayScorer.LayoutPair> pairs = ReplayScorer.layoutPairs(key, layout);
        for (ReplayScorer.LayoutPair pair : pairs) {
            line(report, "  [" + (pair.sameRow() ? "ok" : "XX") + "] " + pair.key() + ": '" + pair.token()
                    + "' with " + pair.amount());
            paired += pair.sameRow() ? 1 : 0;
        }
        line(report, "  " + paired + " of " + pairs.size() + " priced lines on the right row");

        // ------------------------------------------------------------ model, paid and opt-in
        int runs = Integer.getInteger("replay.model-runs", 0);
        line(report, "");
        if (runs <= 0) {
            line(report, "MODEL RUNS: off. Pass -Dreplay.model-runs=N to spend N OpenAI extractions.");
        } else {
            modelRuns(runs, dir, layout, key, report);
        }

        Files.writeString(out.resolve("summary.txt"), report.toString(), StandardCharsets.UTF_8);
        System.out.println(report);
        System.out.println("Report and OCR text written to " + out.toAbsolutePath());
    }

    private void modelRuns(int runs, Path dir, String layout, ReplayScorer.AnswerKey key, StringBuilder report)
            throws Exception {
        Map<String, String> env = dotEnv(Path.of(".env"));
        String openAiKey = setting("OPENAI_API_KEY", env);
        assumeTrue(openAiKey != null, "OPENAI_API_KEY not found in the environment or .env");
        String model = setting("OPENAI_MODEL", env) == null ? "gpt-5.4-mini" : setting("OPENAI_MODEL", env);
        Path image = dir.resolve("upload.jpg");
        assumeTrue(Files.isReadable(image), "Model runs need the upload image at " + image);

        // Vision is replaced by the saved reading; everything after it is the production path,
        // including the date, odometer and total resolvers.
        GoogleVisionOCRProvider replayedVision = mock(GoogleVisionOCRProvider.class);
        when(replayedVision.extractText(any())).thenReturn(layout);
        OCRProcessingService pipeline = new OCRProcessingService(
                replayedVision,
                new OpenAIServiceDraftExtractionProvider(new ObjectMapper(), openAiKey, model),
                new ServiceClassificationService(),
                "google-vision", "openai", 10, 10L * 1024 * 1024);
        VehicleContext vehicle = new VehicleContext(
                VehicleContext.vehicleClassFor("suv"), "suv", "Nissan", "Rogue", 2020, null, null);
        byte[] bytes = Files.readAllBytes(image);

        line(report, "MODEL RUNS: " + runs + " x " + model);
        List<ReplayScorer.RunScore> scores = new ArrayList<>();
        Set<String> inputs = new LinkedHashSet<>();
        for (int run = 1; run <= runs; run++) {
            ReceiptExtractionResult result = pipeline.extractReceiptFields(
                    List.of(new MockMultipartFile("receiptImages", "upload.jpg", "image/jpeg", bytes)),
                    "UPLOAD", vehicle);
            Object sent = result.fieldMetadata() == null ? null : result.fieldMetadata().get("rawOcrText");
            inputs.add(sha(String.valueOf(sent)));
            if (Boolean.TRUE.equals(result.fieldMetadata() == null ? null : result.fieldMetadata().get("fallbackUsed"))) {
                line(report, "  run " + run + ": EXTRACTION FELL BACK " + result.fieldMetadata().get("extractionErrors"));
                continue;
            }
            List<ServiceLineEntryFields> lines = result.services() == null ? List.of()
                    : result.services().stream().flatMap(item -> item.lineEntriesOrEmpty().stream()).toList();
            ReplayScorer.RunScore score = ReplayScorer.score(
                    key, lines, result.totalCost(), result.amountCovered(), result.remarks());
            scores.add(score);
            line(report, "");
            line(report, "  run " + run);
            report.append(ReplayScorer.render(score));
        }
        line(report, "");
        line(report, inputs.size() == 1
                ? "OCR INPUT: identical in every run, so every difference above is the model's"
                : "OCR INPUT: DIFFERED between runs (" + inputs.size() + " versions) - model variance cannot be isolated");
        report.append(ReplayScorer.summarise(scores));
    }

    private static List<String> withoutPageHeader(List<String> lines) {
        return !lines.isEmpty() && lines.get(0).startsWith("[PAGE ") ? lines.subList(1, lines.size()) : lines;
    }

    private static long changedRows(List<String> before, List<String> now) {
        int longest = Math.max(before.size(), now.size());
        long changed = 0;
        for (int i = 0; i < longest; i++) {
            String a = i < before.size() ? before.get(i) : null;
            String b = i < now.size() ? now.get(i) : null;
            if (a == null || !a.equals(b)) {
                changed++;
            }
        }
        return changed;
    }

    private static String setting(String name, Map<String, String> env) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            value = env.get(name);
        }
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** Keys from .env without printing them. */
    private static Map<String, String> dotEnv(Path file) throws IOException {
        Map<String, String> values = new LinkedHashMap<>();
        if (!Files.isReadable(file)) {
            return values;
        }
        for (String rawLine : Files.readAllLines(file, StandardCharsets.UTF_8)) {
            String entry = rawLine.trim();
            if (entry.isEmpty() || entry.startsWith("#") || !entry.contains("=")) {
                continue;
            }
            String name = entry.substring(0, entry.indexOf('=')).trim().replaceFirst("^export\\s+", "");
            String value = entry.substring(entry.indexOf('=') + 1).trim();
            if (value.length() >= 2 && (value.startsWith("\"") && value.endsWith("\"")
                    || value.startsWith("'") && value.endsWith("'"))) {
                value = value.substring(1, value.length() - 1);
            }
            values.put(name, value);
        }
        return values;
    }

    private static String sha(String text) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
    }

    private static void line(StringBuilder builder, String text) {
        builder.append(text).append(System.lineSeparator());
    }
}
