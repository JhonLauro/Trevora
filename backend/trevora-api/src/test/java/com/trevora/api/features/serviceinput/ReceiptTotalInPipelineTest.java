package com.trevora.api.features.serviceinput;

import static com.trevora.api.features.serviceinput.ReceiptTestImages.jpeg;
import static com.trevora.api.features.serviceinput.ReceiptTestImages.receipt;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The Palmetto 57 Nissan receipt through the pipeline, with its verbatim OCR and
 * the total the model returned on the live run. No paid call is made.
 */
class ReceiptTotalInPipelineTest {

    private static String palmetto() throws IOException {
        return Files.readString(
                Path.of("src/test/resources/printed-subtotals/palmetto-jobs-and-totals.txt"), StandardCharsets.UTF_8);
    }

    private static ReceiptExtractionResult run(String ocr, String modelTotal) {
        GoogleVisionOCRProvider vision = mock(GoogleVisionOCRProvider.class);
        when(vision.extractText(any())).thenReturn(ocr);
        OpenAIServiceDraftExtractionProvider openai = mock(OpenAIServiceDraftExtractionProvider.class);
        when(openai.extractFields(any(), any())).thenReturn(new ReceiptDraftFields(
                DocumentType.defaultType(), null, List.of(), null, List.of(), null, new BigDecimal(modelTotal),
                null, null, null, List.of(),
                Map.of("totalCost", Map.of("sourceText", "THIS AMOUNT | " + modelTotal)),
                Map.of(), List.of(), null, List.of(), null, null));

        OCRProcessingService pipeline = new OCRProcessingService(
                vision, openai, mock(ServiceClassificationService.class),
                ReceiptImageQualityGate.off(), ReceiptQualityStats.disabled(),
                "google-vision", "openai", 10, 10L * 1024 * 1024);
        return pipeline.extractReceiptFields(
                List.of(jpeg("palmetto.jpg", receipt(1500, 2000))), "UPLOAD", VehicleContext.UNKNOWN);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> source(ReceiptExtractionResult result, String field) {
        Map<String, Object> sources = (Map<String, Object>) result.fieldMetadata().get("fieldSources");
        return (Map<String, Object>) sources.get(field);
    }

    @Test
    void aReconciledInsuranceCreditSetsTheBillAndWhatWasCovered() throws IOException {
        ReceiptExtractionResult result = run(palmetto(), "200.00");

        assertThat(result.totalCost()).isEqualByComparingTo("256.79");
        assertThat(result.amountCovered()).isEqualByComparingTo("56.79");
        assertThat(result.coverageKind()).isEqualTo("INSURANCE");
        assertThat(source(result, "totalCost").get("sourceText")).isEqualTo("TOTAL CHARGES | 239.99 + TAX | 16.80");
        assertThat(source(result, "amountCovered").get("sourceText")).isEqualTo("LESS INSURANCE | 56.79");
        assertThat(source(result, "amountCovered").get("needsReview")).isEqualTo(true);
        assertThat((List<String>) result.fieldMetadata().get("warnings"))
                .anyMatch(warning -> warning.contains("recorded as covered"));
    }

    @Test
    void aCreditThatDoesNotReconcileLeavesTheModelsTotalAndNothingCovered() throws IOException {
        ReceiptExtractionResult result = run(palmetto().replace("THIS AMOUNT | 200.00", "THIS AMOUNT | 210.00"), "210.00");

        assertThat(result.totalCost()).isEqualByComparingTo("210.00");
        assertThat(result.amountCovered()).isNull();
        assertThat(source(result, "totalCost").get("sourceText")).isEqualTo("THIS AMOUNT | 210.00");
        assertThat(source(result, "amountCovered")).isNull();
    }
}
