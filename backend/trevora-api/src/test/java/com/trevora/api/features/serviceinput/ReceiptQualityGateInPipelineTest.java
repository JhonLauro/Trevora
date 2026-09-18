package com.trevora.api.features.serviceinput;

import static com.trevora.api.features.serviceinput.ReceiptTestImages.blurred;
import static com.trevora.api.features.serviceinput.ReceiptTestImages.jpeg;
import static com.trevora.api.features.serviceinput.ReceiptTestImages.receipt;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

/**
 * Where the gate sits: after the page limits, before the first paid call. What
 * matters is that a stopped upload never reaches Vision, and that the owner's
 * "read anyway" always does.
 */
class ReceiptQualityGateInPipelineTest {
    private final GoogleVisionOCRProvider vision = mock(GoogleVisionOCRProvider.class);
    private final OpenAIServiceDraftExtractionProvider extraction = mock(OpenAIServiceDraftExtractionProvider.class);
    private final MultipartFile sharp = jpeg("sharp.jpg", receipt(1500, 2000));
    private final MultipartFile blurry = jpeg("blurry.jpg", blurred(receipt(1500, 2000), 40));

    @BeforeEach
    void visionReadsSomething() {
        when(vision.extractText(any())).thenReturn("BRAKE SERVICE  TOTAL 1,000.00");
    }

    private OCRProcessingService pipeline(String mode) {
        return new OCRProcessingService(
                vision,
                extraction,
                mock(ServiceClassificationService.class),
                new ReceiptImageQualityGate(mode),
                ReceiptQualityStats.disabled(),
                "google-vision",
                "openai",
                10,
                10L * 1024 * 1024
        );
    }

    @Test
    @DisplayName("enforce: a blurry page stops the upload with its code, and Vision is never called")
    void enforceStopsBlurryPage() {
        ReceiptQualityException stopped = assertThrows(
                ReceiptQualityException.class,
                () -> pipeline("enforce").extractReceiptFields(List.of(blurry), "UPLOAD", VehicleContext.UNKNOWN));

        assertThat(stopped.code()).isEqualTo("RECEIPT_BLURRY");
        assertThat(stopped.pages()).containsExactly(
                new ReceiptQualityException.PageIssue(1, ReceiptQualityIssue.BLURRY));
        verify(vision, never()).extractText(any());
    }

    @Test
    @DisplayName("enforce: one bad page in a stack stops all of it, before any page is paid for")
    void enforceChecksEveryPageFirst() {
        ReceiptQualityException stopped = assertThrows(
                ReceiptQualityException.class,
                () -> pipeline("enforce").extractReceiptFields(
                        List.of(sharp, blurry, sharp), "UPLOAD", VehicleContext.UNKNOWN));

        assertThat(stopped.pages()).extracting(ReceiptQualityException.PageIssue::pageNumber).containsExactly(2);
        verify(vision, never()).extractText(any());
    }

    @Test
    @DisplayName("enforce: read anyway reads the pages as they are")
    void readAnywayReads() {
        pipeline("enforce").extractReceiptFields(List.of(blurry), "UPLOAD", VehicleContext.UNKNOWN, true);

        verify(vision, times(1)).extractText(any());
    }

    @Test
    @DisplayName("enforce: a good page is read, and carries its measurements on the draft")
    void goodPageIsReadWithMeasurements() {
        ReceiptExtractionResult result = pipeline("enforce")
                .extractReceiptFields(List.of(sharp), "UPLOAD", VehicleContext.UNKNOWN);

        verify(vision, times(1)).extractText(any());
        Map<String, Object> quality = quality(result);
        assertThat(quality.get("checked")).isEqualTo(true);
        assertThat(quality.get("issues")).isEqualTo(List.of());
    }

    @Test
    @DisplayName("shadow: a blurry page is measured but still read")
    void shadowNeverStops() {
        ReceiptExtractionResult result = pipeline("shadow")
                .extractReceiptFields(List.of(blurry), "UPLOAD", VehicleContext.UNKNOWN);

        verify(vision, times(1)).extractText(any());
        assertThat(quality(result).get("issues")).isEqualTo(List.of("BLURRY"));
    }

    @Test
    @DisplayName("off: nothing is measured and every page is read")
    void offLooksAtNothing() {
        ReceiptExtractionResult result = pipeline("off")
                .extractReceiptFields(List.of(blurry), "UPLOAD", VehicleContext.UNKNOWN);

        verify(vision, times(1)).extractText(any());
        assertThat(firstPage(result)).doesNotContainKey("quality");
    }

    @Test
    @DisplayName("enforce: a small page is warned about on the draft, and still read")
    void warningsNeverStop() {
        MultipartFile small = jpeg("small.jpg", receipt(600, 450));

        ReceiptExtractionResult result = pipeline("enforce")
                .extractReceiptFields(List.of(small), "UPLOAD", VehicleContext.UNKNOWN);

        verify(vision, times(1)).extractText(any());
        assertThat(quality(result).get("issues")).isEqualTo(List.of());
        assertThat(quality(result).get("warnings")).isEqualTo(List.of("LOW_RESOLUTION"));
    }

    @Test
    @DisplayName("enforce: a sharp photo with no writing (a selfie) stops as NO_TEXT before the AI call")
    void enforceStopsPhotoWithNoText() {
        when(vision.extractText(any())).thenReturn("");

        ReceiptQualityException stopped = assertThrows(
                ReceiptQualityException.class,
                () -> pipeline("enforce").extractReceiptFields(List.of(sharp), "UPLOAD", VehicleContext.UNKNOWN));

        assertThat(stopped.code()).isEqualTo("RECEIPT_NO_TEXT");
        verify(extraction, never()).extractFields(any(), any());
    }

    @Test
    @DisplayName("enforce: writing that is not a receipt (a T-shirt) stops as NO_DOCUMENT on its page")
    void enforceStopsNonDocument() {
        when(vision.extractText(any())).thenReturn("BRAKE SERVICE  TOTAL 1,000.00", "JUST DO IT NIKE ATHLETIC DEPT");

        ReceiptQualityException stopped = assertThrows(
                ReceiptQualityException.class,
                () -> pipeline("enforce").extractReceiptFields(
                        List.of(sharp, sharp), "UPLOAD", VehicleContext.UNKNOWN));

        assertThat(stopped.pages()).containsExactly(
                new ReceiptQualityException.PageIssue(2, ReceiptQualityIssue.NO_DOCUMENT));
        verify(extraction, never()).extractFields(any(), any());
    }

    @Test
    @DisplayName("enforce: read anyway sends a page that is not a receipt on to extraction, marked")
    void readAnywayReadsNonDocument() {
        when(vision.extractText(any())).thenReturn("JUST DO IT NIKE ATHLETIC DEPT");

        ReceiptExtractionResult result = pipeline("enforce")
                .extractReceiptFields(List.of(sharp), "UPLOAD", VehicleContext.UNKNOWN, true);

        verify(extraction, times(1)).extractFields(any(), any());
        assertThat(firstPage(result).get("textCheck")).isEqualTo("NO_DOCUMENT");
    }

    @Test
    @DisplayName("shadow: a page that is not a receipt is marked but never stopped")
    void shadowMarksNonDocument() {
        when(vision.extractText(any())).thenReturn("JUST DO IT NIKE ATHLETIC DEPT");

        ReceiptExtractionResult result = pipeline("shadow")
                .extractReceiptFields(List.of(sharp), "UPLOAD", VehicleContext.UNKNOWN);

        assertThat(firstPage(result).get("textCheck")).isEqualTo("NO_DOCUMENT");
    }

    @Test
    @DisplayName("off: the text is not judged either")
    void offDoesNotJudgeText() {
        when(vision.extractText(any())).thenReturn("JUST DO IT NIKE ATHLETIC DEPT");

        ReceiptExtractionResult result = pipeline("off")
                .extractReceiptFields(List.of(sharp), "UPLOAD", VehicleContext.UNKNOWN);

        assertThat(firstPage(result)).doesNotContainKey("textCheck");
    }

    @Test
    @DisplayName("the constructor tests and the golden harness use has no gate")
    void legacyConstructorHasNoGate() {
        OCRProcessingService ungated = new OCRProcessingService(
                vision,
                mock(OpenAIServiceDraftExtractionProvider.class),
                mock(ServiceClassificationService.class),
                "google-vision",
                "mock",
                10,
                10L * 1024 * 1024);

        ungated.extractReceiptFields(List.of(blurry), "UPLOAD", VehicleContext.UNKNOWN);

        verify(vision, times(1)).extractText(any());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> firstPage(ReceiptExtractionResult result) {
        List<Map<String, Object>> pages = (List<Map<String, Object>>) result.fieldMetadata().get("pages");
        return pages.get(0);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> quality(ReceiptExtractionResult result) {
        return (Map<String, Object>) firstPage(result).get("quality");
    }
}
