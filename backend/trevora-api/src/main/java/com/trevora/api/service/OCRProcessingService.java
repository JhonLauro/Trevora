package com.trevora.api.service;

import com.trevora.api.dto.MockReceiptExtraction;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class OCRProcessingService {
    public MockReceiptExtraction extractReceiptFields(MultipartFile receiptImage) {
        String fileName = receiptImage.getOriginalFilename() == null
                ? "uploaded receipt"
                : receiptImage.getOriginalFilename();

        return new MockReceiptExtraction(
                LocalDate.now(),
                "Receipt-based service",
                null,
                BigDecimal.valueOf(1500.00),
                "Mock OCR Auto Shop",
                null,
                "Mock extracted parts from " + fileName,
                "Mock extracted labor from receipt image",
                "Mock OCR extraction for MVP. Replace OCRProcessingService with a real provider later.",
                Map.of(
                        "inputMethod", "RECEIPT",
                        "source", "mock_ocr",
                        "fileName", fileName,
                        "confidence", Map.of(
                                "serviceDate", 0.82,
                                "serviceType", 0.74,
                                "totalCost", 0.88,
                                "shopName", 0.79
                        )
                )
        );
    }
}
