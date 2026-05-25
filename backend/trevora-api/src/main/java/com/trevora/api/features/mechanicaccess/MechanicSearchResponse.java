package com.trevora.api.features.mechanicaccess;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MechanicSearchResponse(
        UUID sessionId,
        UUID vehicleId,
        String vehicleLabel,
        String query,
        String answer,
        String recommendedView,
        String answerSource,
        int resultCount,
        List<MechanicSharedServiceRecordResponse> records,
        Instant generatedAt
) {
}
