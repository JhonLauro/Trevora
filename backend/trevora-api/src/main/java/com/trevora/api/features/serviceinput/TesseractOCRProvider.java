package com.trevora.api.features.serviceinput;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class TesseractOCRProvider {
    private static final Duration OCR_TIMEOUT = Duration.ofSeconds(30);

    private final String tesseractPath;
    private final String tessdataPath;

    public TesseractOCRProvider(
            @Value("${trevora.ocr.tesseract.path:tesseract}") String tesseractPath,
            @Value("${trevora.ocr.tessdata.path:}") String tessdataPath
    ) {
        this.tesseractPath = blankToDefault(tesseractPath, "tesseract");
        this.tessdataPath = blankToNull(tessdataPath);
    }

    public String extractText(MultipartFile receiptImage) {
        Path tempFile = null;
        try {
            tempFile = Files.createTempFile("trevora-receipt-", extensionFor(receiptImage));
            receiptImage.transferTo(tempFile);

            List<String> command = new ArrayList<>();
            command.add(tesseractPath);
            command.add(tempFile.toAbsolutePath().toString());
            command.add("stdout");
            command.add("-l");
            command.add("eng");
            if (tessdataPath != null) {
                command.add("--tessdata-dir");
                command.add(tessdataPath);
            }

            Process process = new ProcessBuilder(command)
                    .redirectErrorStream(true)
                    .start();
            CompletableFuture<String> outputFuture = CompletableFuture.supplyAsync(() -> readOutput(process));
            boolean completed = process.waitFor(OCR_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            if (!completed) {
                process.destroyForcibly();
                throw new ReceiptProcessingException("Tesseract OCR timed out.");
            }

            String output = outputFuture.get();
            if (process.exitValue() != 0) {
                throw new ReceiptProcessingException("Tesseract OCR exited with code " + process.exitValue() + ".");
            }
            return output.trim();
        } catch (IOException exception) {
            throw new ReceiptProcessingException("Tesseract OCR is unavailable or could not read the receipt image.", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ReceiptProcessingException("Tesseract OCR was interrupted.", exception);
        } catch (ExecutionException exception) {
            throw new ReceiptProcessingException("Tesseract OCR output could not be read.", exception);
        } finally {
            if (tempFile != null) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException ignored) {
                    // Temporary file cleanup failure should not block draft creation.
                }
            }
        }
    }

    private String readOutput(Process process) {
        try {
            return new String(process.getInputStream().readAllBytes());
        } catch (IOException exception) {
            throw new ReceiptProcessingException("Tesseract OCR output could not be read.", exception);
        }
    }

    private String extensionFor(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name == null) {
            return ".img";
        }
        int index = name.lastIndexOf('.');
        if (index < 0 || index == name.length() - 1) {
            return ".img";
        }
        String extension = name.substring(index).toLowerCase(Locale.ROOT);
        if (extension.length() > 10 || !extension.matches("\\.[a-z0-9]+")) {
            return ".img";
        }
        return extension;
    }

    private String blankToDefault(String value, String fallback) {
        String normalized = blankToNull(value);
        return normalized == null ? fallback : normalized;
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
