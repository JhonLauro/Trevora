package com.trevora.api.features.serviceinput.golden;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.serviceinput.OpenAIServiceDraftExtractionProvider;
import com.trevora.api.features.serviceinput.ReceiptDraftFields;
import com.trevora.api.features.serviceinput.ServiceClassification;
import com.trevora.api.features.serviceinput.ServiceClassificationService;
import com.trevora.api.features.serviceinput.ServiceItemFields;
import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Runs the real extraction against the golden set and prints the scorecard.
 *
 * <p>Tagged {@code golden} and excluded from {@code ./mvnw test}, because it
 * calls the OpenAI API: it costs money and takes seconds per run. Run it
 * deliberately:
 *
 * <pre>
 *   ./mvnw test -Pgolden
 *   ./mvnw test -Pgolden -Dgolden.runs=5
 * </pre>
 *
 * <p><b>It does not assert a score.</b> That is deliberate. A threshold here
 * would either be set low enough to pass today — in which case it asserts
 * nothing — or fail the build until the pipeline is fixed, which makes the
 * measurement an obstacle rather than an instrument. The report is the output.
 * Once the numbers stabilise, add regression floors per field so a change that
 * drops line-kind accuracy from 84% to 40% breaks the build.
 *
 * <p>What it <i>does</i> assert is that every case loaded and produced a
 * parseable extraction, so a broken case file or a malformed response fails
 * loudly rather than quietly scoring zero.
 */
@Tag("golden")
class GoldenExtractionTest {

    private static final int DEFAULT_RUNS = 3;

    @Test
    void scoreGoldenSet() {
        String apiKey = System.getenv("OPENAI_API_KEY");
        assumeTrue(apiKey != null && !apiKey.isBlank(),
                "OPENAI_API_KEY is not set — skipping the golden set rather than failing.");

        int runs = Integer.getInteger("golden.runs", DEFAULT_RUNS);
        // -Dgolden.dump=true prints the extracted lines. The score says a field
        // is wrong; this says how, which is the difference between knowing there
        // is a problem and knowing what to change in the prompt.
        boolean dump = Boolean.getBoolean("golden.dump");
        String model = System.getenv().getOrDefault("OPENAI_MODEL", "gpt-4o-mini");

        OpenAIServiceDraftExtractionProvider provider =
                new OpenAIServiceDraftExtractionProvider(new ObjectMapper(), apiKey, model);

        List<GoldenCase> cases = GoldenCase.loadAll();
        assumeTrue(!cases.isEmpty(), "The golden set is empty.");

        // The same keyword fallback production applies, so the score reflects
        // what would be stored rather than the model's raw answer.
        ServiceClassificationService classificationService = new ServiceClassificationService();
        GoldenReport report = new GoldenReport();

        for (GoldenCase goldenCase : cases) {
            for (int run = 0; run < runs; run++) {
                ReceiptDraftFields extracted = provider.extractFields(goldenCase.ocrText(), goldenCase.vehicleContext());
                if (extracted == null) {
                    throw new AssertionError("Extraction returned null for case " + goldenCase.id());
                }
                ServiceClassification effective = classificationService.classifyAiOrFallback(
                        extracted.classification(),
                        goldenCase.ocrText(),
                        serviceTypes(extracted),
                        null,
                        null,
                        extracted.remarks(),
                        1,
                        goldenCase.vehicleContext()
                );
                report.record(goldenCase.id(), GoldenScorer.score(
                        goldenCase, extracted, new java.util.LinkedHashSet<>(effective.relatedComponents())));
                if (dump && run == 0) {
                    dumpLines(goldenCase.id(), extracted);
                }
            }
        }

        System.out.println(report.render(runs));
    }

    private static String serviceTypes(ReceiptDraftFields fields) {
        if (fields.services() == null || fields.services().isEmpty()) {
            return null;
        }
        return fields.services().stream()
                .map(ServiceItemFields::serviceType)
                .filter(value -> value != null && !value.isBlank())
                .reduce((first, second) -> first + ", " + second)
                .orElse(null);
    }

    private static void dumpLines(String caseId, ReceiptDraftFields extracted) {
        System.out.println(System.lineSeparator() + "--- " + caseId + " : extracted lines ---");
        if (extracted.services() == null || extracted.services().isEmpty()) {
            System.out.println("  (no services)");
            return;
        }
        extracted.services().forEach(service -> {
            System.out.println("  service: " + service.serviceType()
                    + "  lineCost=" + service.lineCost());
            service.lineEntriesOrEmpty().forEach(entry -> System.out.printf(
                    "    %-10s %-38s code=%-16s qty=%-6s unit=%-10s total=%s%n",
                    entry.kind(), entry.description(), entry.partCode(),
                    entry.quantity(), entry.unitPrice(), entry.lineTotal()));
        });
        extracted.warnings().forEach(warning -> System.out.println("  ! " + warning));
    }
}
