package com.trevora.api.dto;

public record ServiceRecordConfirmationResponse(
        ServiceRecordResponse serviceRecord,
        ServiceDraftResponse draft,
        ValidationResult validation,
        String message
) {
}
