package com.trevora.api.features.serviceinput;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One unfinished draft, as the Garage lists it.
 *
 * <p>Deliberately not {@link ServiceDraftResponse}. That carries the draft's
 * services, and every service carries its receipt lines, so building it for a
 * list means a fetch per draft to render a row that shows none of it. This
 * holds only what a row needs to be recognised and reopened.
 */
public record ServiceDraftSummaryResponse(
        UUID draftId,
        UUID vehicleId,
        InputMethod inputMethod,
        LocalDate serviceDate,
        BigDecimal totalCost,
        String shopName,
        DraftStatus status,
        Instant createdAt
) {
    public static ServiceDraftSummaryResponse from(ServiceDraft draft) {
        return new ServiceDraftSummaryResponse(
                draft.getDraftId(),
                draft.getVehicleId(),
                draft.getInputMethod(),
                draft.getServiceDate(),
                draft.getTotalCost(),
                draft.getShopName(),
                draft.getStatus(),
                draft.getCreatedAt()
        );
    }
}
