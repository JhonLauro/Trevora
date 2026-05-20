package com.trevora.api.features.ai;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record AIExplanationResponse(
        UUID recordId,
        UUID vehicleId,
        String source,
        boolean fallback,
        String whatWasDone,
        String whyItMatters,
        List<String> watchFor,
        String disclaimer,
        Instant generatedAt
) {
}
