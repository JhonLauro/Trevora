package com.trevora.api.service;

import com.trevora.api.model.ServiceDraft;
import java.util.function.Function;

record FieldValidationRule(
        String fieldName,
        String label,
        Function<ServiceDraft, Object> valueExtractor
) {
}
