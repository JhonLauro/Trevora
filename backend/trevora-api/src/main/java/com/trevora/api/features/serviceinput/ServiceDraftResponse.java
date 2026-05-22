package com.trevora.api.features.serviceinput;

import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.serviceinput.ServiceDraft;
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
        String receiptStorageBucket,
        String receiptStoragePath,
        String receiptOriginalFilename,
        String receiptContentType,
        Instant createdAt
) {
    public static ServiceDraftResponse from(ServiceDraft draft) {
        if (isLegacyMockVoiceDraft(draft)) {
            return fromLegacyMockVoiceDraft(draft);
        }

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
                draft.getReceiptStorageBucket(),
                draft.getReceiptStoragePath(),
                draft.getReceiptOriginalFilename(),
                draft.getReceiptContentType(),
                draft.getCreatedAt()
        );
    }

    private static ServiceDraftResponse fromLegacyMockVoiceDraft(ServiceDraft draft) {
        return new ServiceDraftResponse(
                draft.getDraftId(),
                draft.getVehicleId(),
                draft.getOwnerId(),
                draft.getInputMethod(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                draft.getStatus(),
                legacyVoiceMetadata(draft.getFieldMetadata()),
                draft.getReceiptStorageBucket(),
                draft.getReceiptStoragePath(),
                draft.getReceiptOriginalFilename(),
                draft.getReceiptContentType(),
                draft.getCreatedAt()
        );
    }

    private static boolean isLegacyMockVoiceDraft(ServiceDraft draft) {
        if (draft.getInputMethod() != InputMethod.VOICE || draft.getFieldMetadata() == null) {
            return false;
        }
        Object source = draft.getFieldMetadata().get("source");
        return "mock_voice_transcription".equals(source);
    }

    private static Map<String, Object> legacyVoiceMetadata(Map<String, Object> originalMetadata) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("inputMethod", "VOICE");
        metadata.put("inputType", "voice");
        metadata.put("source", "legacy_voice_transcript_only");
        metadata.put("fallbackUsed", true);

        if (originalMetadata != null && originalMetadata.get("transcript") instanceof String transcript && !transcript.isBlank()) {
            metadata.put("transcript", transcript);
        }

        metadata.put("confidenceNotes", List.of("This draft was created before real voice extraction was enabled. Only the transcript is trusted."));
        metadata.put("fieldSources", Map.of());
        metadata.put("warnings", List.of("Legacy mock voice fields were hidden. Re-record or complete the missing fields during review."));
        return metadata;
    }
}
