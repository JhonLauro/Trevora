package com.trevora.api.features.validation;

import com.trevora.api.features.serviceinput.ServiceDraft;
import java.util.function.Function;

record FieldValidationRule(
        String fieldName,
        String label,
        Function<ServiceDraft, Object> valueExtractor
) {
}
