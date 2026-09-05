package com.trevora.api.features.concern;

import java.time.Instant;
import java.util.UUID;

/**
 * An open concern as a mechanic reads it.
 *
 * <p>Narrower than {@link ConcernResponse} on purpose. The mechanic gets the
 * words and when they were written, because "three weeks ago" and "yesterday"
 * change what is worth checking. They do not get {@code resolvedAt} — every
 * concern they can see is open, so the field would only ever say null — and
 * they do not get {@code updatedAt}, which is the owner's editing history and
 * none of a mechanic's business.
 */
public record MechanicConcernResponse(
        UUID concernId,
        String note,
        Instant noticedAt
) {
    public static MechanicConcernResponse from(Concern concern) {
        return new MechanicConcernResponse(
                concern.getConcernId(),
                concern.getNote(),
                concern.getCreatedAt()
        );
    }
}
