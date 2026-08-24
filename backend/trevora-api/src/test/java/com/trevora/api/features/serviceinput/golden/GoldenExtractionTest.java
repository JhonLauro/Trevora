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
 * calls the OpenAI API for real. A run is a cent or two and tens of seconds,
 * so run it freely - just deliberately:
 *
 * <pre>
 *   ./mvnw test -Pgolden
 *   ./mvnw test -Pgolden -Dgolden.runs=5
 * </pre>
 *
 * <p><b>It asserts regression floors.</b> It did not, originally, on the
 * grounds that the numbers had not stabilised — and while it did not, two
 * prompt changes took line kinds and line prices from 100% to 36% and were
 * merged anyway, because a diff that reads sensibly is not evidence. The
 * numbers have since held across four separate code states, so the floors in
 * {@link GoldenReport} now break the build instead of trusting whoever is
 * reading the scorecard to notice.
 *
 * <p>A single extraction that comes back unusable does <b>not</b> fail the run.
 * Roughly one in twenty does, even at temperature 0, and treating that as a
 * breakage destroyed the whole report for the other eight. They are counted and
 * printed; only a rate high enough to be a real fault fails the build.
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
                ReceiptDraftFields extracted;
                try {
                    extracted = provider.extractFields(goldenCase.ocrText(), goldenCase.vehicleContext());
                } catch (RuntimeException exception) {
                    report.recordFailure(goldenCase.id(), exception.getMessage());
                    continue;
                }
                if (extracted == null) {
                    report.recordFailure(goldenCase.id(), "extraction returned null");
                    continue;
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

        // A quarter of extractions failing is not the model having a bad day,
        // it is something broken — a bad key, a changed API, a prompt the model
        // will not answer.
        if (report.attempts() > 0 && report.failures().size() * 4 > report.attempts()) {
            throw new AssertionError(report.failures().size() + " of " + report.attempts()
                    + " extractions produced nothing. That is a fault, not flakiness:\n  "
                    + String.join("\n  ", report.failures()));
        }

        List<String> violations = report.floorViolations();
        if (!violations.isEmpty()) {
            throw new AssertionError("Receipt extraction regressed:\n  "
                    + String.join("\n  ", violations)
                    + "\n\nIf this is a deliberate trade-off, move the floor in GoldenReport"
                    + " in the same commit and say why.");
        }
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
