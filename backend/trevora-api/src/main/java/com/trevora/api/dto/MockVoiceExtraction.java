package com.trevora.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

public record MockVoiceExtraction(
        LocalDate serviceDate,
        String serviceType,
        Integer odometer,
        BigDecimal totalCost,
        String shopName,
        String location,
        String partsReplaced,
        String laborPerformed,
        String remarks,
        Map<String, Object> fieldMetadata
) {
}
