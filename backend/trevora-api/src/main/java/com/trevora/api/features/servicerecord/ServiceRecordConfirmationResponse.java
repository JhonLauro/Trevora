package com.trevora.api.features.servicerecord;


import com.trevora.api.features.serviceinput.ServiceDraftResponse;
import com.trevora.api.features.validation.ValidationResult;
import com.trevora.api.features.vehicle.ReceiptWarrantyFill;
public record ServiceRecordConfirmationResponse(
        ServiceRecordResponse serviceRecord,
        ServiceDraftResponse draft,
        ValidationResult validation,
        String message,
        /* The warranty dates this receipt filled on the vehicle, so the Saved
           page can say so. Null when nothing was filled. */
        ReceiptWarrantyFill.Filled warrantyUpdate
) {
}
