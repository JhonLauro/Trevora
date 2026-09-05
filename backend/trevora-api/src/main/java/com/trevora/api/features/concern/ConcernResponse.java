package com.trevora.api.features.concern;

import java.time.Instant;
import java.util.UUID;

/**
 * A concern as the owner's own screens read it.
 *
 * <p>{@code createdAt} is carried rather than a formatted age because "three
 * weeks ago" and "yesterday" change what a reader does about it, and the
 * wording of that belongs to whichever screen is asking.
 */
public record ConcernResponse(
        UUID concernId,
        UUID vehicleId,
        String note,
        Instant createdAt,
        Instant updatedAt,
        Instant resolvedAt
) {
    public static ConcernResponse from(Concern concern) {
        return new ConcernResponse(
                concern.getConcernId(),
                concern.getVehicleId(),
                concern.getNote(),
                concern.getCreatedAt(),
                concern.getUpdatedAt(),
                concern.getResolvedAt()
        );
    }
}
