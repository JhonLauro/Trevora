package com.trevora.api.features.servicerecord;


import com.trevora.api.features.serviceinput.ServiceDraftResponse;
import com.trevora.api.features.validation.ValidationResult;
public record ServiceRecordConfirmationResponse(
        ServiceRecordResponse serviceRecord,
        ServiceDraftResponse draft,
        ValidationResult validation,
        String message
) {
}
