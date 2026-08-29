package com.trevora.api.features.serviceinput;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

/**
 * Each page of an upload is its own billed Google Vision call, made in a loop
 * while the caller waits. The cap is what stops one request from spending an
 * unbounded amount of money, so what matters is that it is enforced before the
 * provider is reached at all.
 */
class ReceiptPageLimitTest {

    private final GoogleVisionOCRProvider vision = mock(GoogleVisionOCRProvider.class);

    private OCRProcessingService service(int maxPages) {
        return new OCRProcessingService(
                vision,
                mock(OpenAIServiceDraftExtractionProvider.class),
                mock(ServiceClassificationService.class),
                "google-vision",
                "mock",
                maxPages,
                10L * 1024L * 1024L
        );
    }

    private List<MultipartFile> pages(int count) {
        List<MultipartFile> files = new ArrayList<>();
        IntStream.rangeClosed(1, count).forEach(page ->
                files.add(new MockMultipartFile(
                        "receiptImages", "page" + page + ".jpg", "image/jpeg", new byte[] {1, 2, 3})));
        return files;
    }

    @Test
    @DisplayName("an upload past the cap is rejected without calling the OCR provider")
    void overLimitUploadIsRejected() {
        OCRProcessingService ocr = service(10);

        ReceiptUploadException thrown = assertThrows(
                ReceiptUploadException.class,
                () -> ocr.extractReceiptFields(pages(11), "UPLOAD", VehicleContext.UNKNOWN));

        assertTrue(thrown.getMessage().contains("at most 10 pages"));
        assertTrue(thrown.getMessage().contains("11"));
        verify(vision, never()).extractText(any());
    }

    @Test
    @DisplayName("an upload exactly at the cap is read, one billed call per page")
    void uploadAtTheLimitIsAccepted() {
        when(vision.extractText(any())).thenReturn("BRAKE SERVICE 1000");
        OCRProcessingService ocr = service(3);

        ocr.extractReceiptFields(pages(3), "UPLOAD", VehicleContext.UNKNOWN);

        verify(vision, times(3)).extractText(any());
    }

    @Test
    @DisplayName("empty parts are dropped rather than counted or billed")
    void emptyPartsAreNotCharged() {
        when(vision.extractText(any())).thenReturn("BRAKE SERVICE 1000");
        OCRProcessingService ocr = service(2);
        List<MultipartFile> files = new ArrayList<>(pages(2));
        files.add(new MockMultipartFile("receiptImages", "blank.jpg", "image/jpeg", new byte[0]));

        ocr.extractReceiptFields(files, "UPLOAD", VehicleContext.UNKNOWN);

        verify(vision, times(2)).extractText(any());
    }

    @Test
    @DisplayName("an oversized page is rejected without calling the OCR provider")
    void oversizedPageIsRejected() {
        OCRProcessingService ocr = new OCRProcessingService(
                vision,
                mock(OpenAIServiceDraftExtractionProvider.class),
                mock(ServiceClassificationService.class),
                "google-vision",
                "mock",
                10,
                1024L);
        List<MultipartFile> files = List.of(
                new MockMultipartFile("receiptImages", "huge.jpg", "image/jpeg", new byte[2048]));

        ReceiptUploadException thrown = assertThrows(
                ReceiptUploadException.class,
                () -> ocr.extractReceiptFields(files, "UPLOAD", VehicleContext.UNKNOWN));

        assertTrue(thrown.getMessage().contains("huge.jpg"), "the message should name the offending page");
        verify(vision, never()).extractText(any());
    }

    @Test
    @DisplayName("a nonsense cap is floored rather than trusted")
    void capIsFloored() {
        OCRProcessingService ocr = service(0);

        assertThrows(
                ReceiptUploadException.class,
                () -> ocr.extractReceiptFields(pages(2), "UPLOAD", VehicleContext.UNKNOWN));
    }
}
