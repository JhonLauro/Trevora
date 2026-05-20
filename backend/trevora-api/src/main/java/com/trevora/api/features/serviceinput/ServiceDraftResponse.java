package com.trevora.api.features.serviceinput;

import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.serviceinput.ServiceDraft;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

public record ServiceDraftResponse(
        UUID draftId,
        UUID vehicleId,
        UUID ownerId,
        InputMethod inputMethod,
        LocalDate serviceDate,
        String serviceType,
        Integer odometer,
        BigDecimal totalCost,
        String shopName,
        String location,
        String partsReplaced,
        String laborPerformed,
        String remarks,
        DraftStatus status,
        Map<String, Object> fieldMetadata,
        Instant createdAt
) {
    public static ServiceDraftResponse from(ServiceDraft draft) {
        return new ServiceDraftResponse(
                draft.getDraftId(),
                draft.getVehicleId(),
                draft.getOwnerId(),
                draft.getInputMethod(),
                draft.getServiceDate(),
                draft.getServiceType(),
                draft.getOdometer(),
                draft.getTotalCost(),
                draft.getShopName(),
                draft.getLocation(),
                draft.getPartsReplaced(),
                draft.getLaborPerformed(),
                draft.getRemarks(),
                draft.getStatus(),
                draft.getFieldMetadata(),
                draft.getCreatedAt()
        );
    }
}
