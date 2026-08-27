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
        /**
         * The facts that used to be glued onto the end of {@code whatWasDone}.
         * Empty when the record carries none, never null.
         */
        List<AIExplanationDetail> details,
        String whyItMatters,
        List<String> watchFor,
        String disclaimer,
        Instant generatedAt
) {
}
