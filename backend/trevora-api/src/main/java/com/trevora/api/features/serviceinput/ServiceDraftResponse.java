package com.trevora.api.features.serviceinput;

import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.shared.dto.ServiceItemResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record ServiceDraftResponse(
        UUID draftId,
        UUID vehicleId,
        UUID ownerId,
        InputMethod inputMethod,
        LocalDate serviceDate,
        List<ServiceItemResponse> services,
        Integer odometer,
        BigDecimal totalCost,
        BigDecimal amountCovered,
        String shopName,
        String location,
        String remarks,
        DraftStatus status,
        Map<String, Object> fieldMetadata,
        String receiptStorageBucket,
        String receiptStoragePath,
        String receiptOriginalFilename,
        String receiptContentType,
        Instant createdAt
) {
    public static ServiceDraftResponse from(ServiceDraft draft, List<ServiceDraftItem> items) {
        boolean legacyMockVoiceDraft = isLegacyMockVoiceDraft(draft);
        Map<String, Object> fieldMetadata = legacyMockVoiceDraft
                ? legacyVoiceMetadata(draft.getFieldMetadata())
                : draft.getFieldMetadata();
        List<ServiceItemResponse> services = legacyMockVoiceDraft || items == null
                ? List.of()
                : items.stream().map(ServiceItemResponse::from).toList();

        return new ServiceDraftResponse(
                draft.getDraftId(),
                draft.getVehicleId(),
                draft.getOwnerId(),
                draft.getInputMethod(),
                legacyMockVoiceDraft ? null : draft.getServiceDate(),
                services,
                legacyMockVoiceDraft ? null : draft.getOdometer(),
                legacyMockVoiceDraft ? null : draft.getTotalCost(),
                draft.getAmountCovered(),
                legacyMockVoiceDraft ? null : draft.getShopName(),
                legacyMockVoiceDraft ? null : draft.getLocation(),
                legacyMockVoiceDraft ? null : draft.getRemarks(),
                draft.getStatus(),
                fieldMetadata,
                draft.getReceiptStorageBucket(),
                draft.getReceiptStoragePath(),
                draft.getReceiptOriginalFilename(),
                draft.getReceiptContentType(),
                draft.getCreatedAt()
        );
    }

    private static boolean isLegacyMockVoiceDraft(ServiceDraft draft) {
        if (draft == null || draft.getInputMethod() != InputMethod.VOICE || draft.getFieldMetadata() == null) {
            return false;
        }
        Object source = draft.getFieldMetadata().get("source");
        return "mock_voice_transcription".equals(source);
    }

    private static Map<String, Object> legacyVoiceMetadata(Map<String, Object> original) {
        Map<String, Object> metadata = new LinkedHashMap<>(original == null ? Map.of() : original);
        metadata.put("source", "legacy_voice_transcript_only");
        metadata.put("fallbackUsed", true);
        metadata.put("confidence", Map.of());
        metadata.put("confidenceNotes", List.of("Legacy mock voice fields were hidden. Review the transcript and fill missing service details."));
        metadata.put("warnings", List.of("This draft was created before real voice extraction was restored."));
        return metadata;
    }
}
