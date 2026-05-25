package com.trevora.api.features.validation;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.serviceinput.ServiceInputService;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.features.validation.FieldValidationIssue;
import com.trevora.api.features.serviceinput.ServiceDraftResponse;
import com.trevora.api.features.validation.ServiceDraftReviewResponse;
import com.trevora.api.features.validation.ValidationResult;
import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import com.trevora.api.shared.exception.UnauthorizedVehicleAccessException;
import com.trevora.api.features.serviceinput.ServiceDraft;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ServiceDraftValidationService {
    private static final double LOW_CONFIDENCE_THRESHOLD = 0.75;
    private static final List<FieldValidationRule> REQUIRED_RULES = List.of(
            new FieldValidationRule("vehicleId", "Vehicle profile", ServiceDraft::getVehicleId),
            new FieldValidationRule("serviceDate", "Service date", ServiceDraft::getServiceDate),
            new FieldValidationRule("totalCost", "Total cost", ServiceDraft::getTotalCost)
    );

    private final ServiceInputService serviceInputService;
    private final VehicleService vehicleService;
    private final CurrentUserService currentUserService;

    public ServiceDraftValidationService(
            ServiceInputService serviceInputService,
            VehicleService vehicleService,
            CurrentUserService currentUserService
    ) {
        this.serviceInputService = serviceInputService;
        this.vehicleService = vehicleService;
        this.currentUserService = currentUserService;
    }

    public ServiceDraftReviewResponse getDraftReview(UUID draftId) {
        currentUserService.requireVehicleOwner();
        ServiceDraft draft = serviceInputService.getDraftForMockOwner(draftId);
        return new ServiceDraftReviewResponse(ServiceDraftResponse.from(draft), validateDraft(draft));
    }

    public ValidationResult validateDraftForMockOwner(UUID draftId) {
        currentUserService.requireVehicleOwner();
        return validateDraft(serviceInputService.getDraftForMockOwner(draftId));
    }

    public ValidationResult validateDraft(ServiceDraft draft) {
        List<FieldValidationIssue> missingRequiredFields = findMissingRequiredFields(draft);
        List<FieldValidationIssue> flaggedFields = draft.getInputMethod() == InputMethod.MANUAL
                ? List.of()
                : findMetadataFlags(draft);
        List<String> reviewSummary = buildReviewSummary(missingRequiredFields, flaggedFields);

        return new ValidationResult(
                draft.getDraftId(),
                missingRequiredFields.isEmpty(),
                missingRequiredFields,
                flaggedFields,
                reviewSummary
        );
    }

    private List<FieldValidationIssue> findMissingRequiredFields(ServiceDraft draft) {
        List<FieldValidationIssue> issues = new ArrayList<>();

        for (FieldValidationRule rule : REQUIRED_RULES) {
            Object value = rule.valueExtractor().apply(draft);
            if (isMissing(value)) {
                issues.add(new FieldValidationIssue(
                        rule.fieldName(),
                        rule.label(),
                        "MISSING_REQUIRED",
                        "ERROR",
                        rule.label() + " is required before confirmation.",
                        value,
                        null,
                        metadataSource(draft),
                        true,
                        true
                ));
            }
        }

        if (draft.getVehicleId() != null) {
            try {
                vehicleService.verifyVehicleBelongsToMockOwner(draft.getVehicleId());
            } catch (ResourceNotFoundException | UnauthorizedVehicleAccessException exception) {
                issues.add(new FieldValidationIssue(
                        "vehicleId",
                        "Vehicle profile",
                        "INVALID_REQUIRED",
                        "ERROR",
                        "Vehicle profile could not be verified for this owner.",
                        draft.getVehicleId(),
                        null,
                        metadataSource(draft),
                        true,
                        true
                ));
            }
        }

        return issues;
    }

    private List<FieldValidationIssue> findMetadataFlags(ServiceDraft draft) {
        List<FieldValidationIssue> issues = new ArrayList<>();
        Map<String, Object> metadata = draft.getFieldMetadata();
        if (metadata == null || metadata.isEmpty()) {
            return issues;
        }

        Object confidenceNode = metadata.get("confidence");
        if (confidenceNode instanceof Map<?, ?> confidenceMap) {
            for (Map.Entry<?, ?> entry : confidenceMap.entrySet()) {
                String fieldName = String.valueOf(entry.getKey());
                Double confidence = asDouble(entry.getValue());
                if (confidence == null) {
                    continue;
                }
                if (isOptionalMissingField(draft, fieldName)) {
                    continue;
                }

                boolean lowConfidence = confidence < LOW_CONFIDENCE_THRESHOLD;
                issues.add(new FieldValidationIssue(
                        fieldName,
                        labelFor(fieldName),
                        lowConfidence ? "LOW_CONFIDENCE" : "SOURCE_FIELD",
                        lowConfidence ? "WARNING" : "INFO",
                        lowConfidence
                                ? labelFor(fieldName) + " has low extraction confidence and should be reviewed."
                                : labelFor(fieldName) + " was extracted from the draft source.",
                        valueForField(draft, fieldName),
                        confidence,
                        metadataSource(draft),
                        false,
                        lowConfidence
                ));
            }
        }

        Object fieldConfidenceNode = metadata.get("fieldConfidence");
        if (fieldConfidenceNode instanceof Map<?, ?> fieldConfidenceMap) {
            for (Map.Entry<?, ?> entry : fieldConfidenceMap.entrySet()) {
                String fieldName = String.valueOf(entry.getKey());
                String confidence = String.valueOf(entry.getValue()).toLowerCase(Locale.ROOT);
                if (containsAnyIssue(issues, fieldName)) {
                    continue;
                }
                if (isOptionalMissingField(draft, fieldName)) {
                    continue;
                }
                switch (confidence) {
                    case "not_found" -> issues.add(fieldMetadataIssue(
                            draft,
                            fieldName,
                            "NOT_FOUND",
                            "WARNING",
                            labelFor(fieldName) + " was not found in the receipt source.",
                            true
                    ));
                    case "low" -> issues.add(fieldMetadataIssue(
                            draft,
                            fieldName,
                            "LOW_CONFIDENCE",
                            "WARNING",
                            labelFor(fieldName) + " has low extraction confidence and should be reviewed.",
                            true
                    ));
                    case "medium" -> issues.add(fieldMetadataIssue(
                            draft,
                            fieldName,
                            "SOURCE_FIELD",
                            "INFO",
                            labelFor(fieldName) + " was extracted or suggested from the draft source.",
                            false
                    ));
                    case "high" -> issues.add(fieldMetadataIssue(
                            draft,
                            fieldName,
                            "SOURCE_FIELD",
                            "INFO",
                            labelFor(fieldName) + " was extracted from the draft source.",
                            false
                    ));
                    default -> {
                    }
                }
            }
        }

        Object fieldSourcesNode = metadata.get("fieldSources");
        if (fieldSourcesNode instanceof Map<?, ?> fieldSourcesMap) {
            for (Map.Entry<?, ?> entry : fieldSourcesMap.entrySet()) {
                String fieldName = String.valueOf(entry.getKey());
                if (!(entry.getValue() instanceof Map<?, ?> evidence)) {
                    continue;
                }
                String sourceType = evidence.get("sourceType") == null ? "" : String.valueOf(evidence.get("sourceType"));
                boolean needsReview = Boolean.parseBoolean(String.valueOf(evidence.get("needsReview")));
                if (isOptionalMissingField(draft, fieldName)) {
                    continue;
                }
                if ("CONFLICTING".equalsIgnoreCase(sourceType) && !containsIssue(issues, fieldName, "UNCERTAIN")) {
                    issues.add(fieldMetadataIssue(
                            draft,
                            fieldName,
                            "UNCERTAIN",
                            "WARNING",
                            labelFor(fieldName) + " has conflicting source values and should be reviewed.",
                            true
                    ));
                } else if (needsReview && !containsIssue(issues, fieldName, "LOW_CONFIDENCE")) {
                    issues.add(fieldMetadataIssue(
                            draft,
                            fieldName,
                            "LOW_CONFIDENCE",
                            "WARNING",
                            labelFor(fieldName) + " was suggested by AI and should be reviewed.",
                            true
                    ));
                }
            }
        }

        addNamedMetadataFlags(issues, draft, "notFound", "NOT_FOUND", "WARNING", "was marked not found in source metadata.");
        addNamedMetadataFlags(issues, draft, "missing", "MISSING_METADATA", "WARNING", "was marked missing in source metadata.");
        addNamedMetadataFlags(issues, draft, "uncertain", "UNCERTAIN", "WARNING", "was marked uncertain in source metadata.");
        addNamedMetadataFlags(issues, draft, "lowConfidence", "LOW_CONFIDENCE", "WARNING", "was marked low confidence in source metadata.");
        addNamedMetadataFlags(issues, draft, "sourceFields", "SOURCE_FIELD", "INFO", "was identified as source-derived metadata.");
        addClassificationFlag(issues, draft);

        return issues;
    }

    private void addClassificationFlag(List<FieldValidationIssue> issues, ServiceDraft draft) {
        Object classificationNode = draft.getFieldMetadata() == null ? null : draft.getFieldMetadata().get("classification");
        if (!(classificationNode instanceof Map<?, ?> classification)) {
            return;
        }
        boolean needsOwnerReview = Boolean.parseBoolean(String.valueOf(classification.get("needsOwnerReview")));
        String confidence = classification.get("confidence") == null ? "" : String.valueOf(classification.get("confidence")).toLowerCase(Locale.ROOT);
        if (!needsOwnerReview && !"low".equals(confidence)) {
            return;
        }
        if (containsAnyIssue(issues, "classification")) {
            return;
        }
        issues.add(new FieldValidationIssue(
                "classification",
                "Classification",
                "CLASSIFICATION_REVIEW",
                "WARNING",
                "Service category and related component suggestions should be reviewed by the owner.",
                classification,
                switch (confidence) {
                    case "high" -> 0.9;
                    case "medium" -> 0.7;
                    default -> 0.45;
                },
                metadataSource(draft),
                false,
                true
        ));
    }

    private FieldValidationIssue fieldMetadataIssue(
            ServiceDraft draft,
            String fieldName,
            String category,
            String severity,
            String message,
            boolean requiresReview
    ) {
        return new FieldValidationIssue(
                fieldName,
                labelFor(fieldName),
                category,
                severity,
                message,
                valueForField(draft, fieldName),
                confidenceFor(draft, fieldName),
                metadataSource(draft),
                false,
                requiresReview
        );
    }

    private void addNamedMetadataFlags(
            List<FieldValidationIssue> issues,
            ServiceDraft draft,
            String metadataKey,
            String category,
            String severity,
            String messageSuffix
    ) {
        Object node = draft.getFieldMetadata() == null ? null : draft.getFieldMetadata().get(metadataKey);
        for (String fieldName : fieldNamesFromNode(node)) {
            if (containsIssue(issues, fieldName, category)) {
                continue;
            }
            if (isOptionalMissingField(draft, fieldName)) {
                continue;
            }
            issues.add(new FieldValidationIssue(
                    fieldName,
                    labelFor(fieldName),
                    category,
                    severity,
                    labelFor(fieldName) + " " + messageSuffix,
                    valueForField(draft, fieldName),
                    confidenceFor(draft, fieldName),
                    metadataSource(draft),
                    false,
                    !"INFO".equals(severity)
            ));
        }
    }

    private List<String> fieldNamesFromNode(Object node) {
        if (node instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        if (node instanceof Map<?, ?> map) {
            return map.keySet().stream().map(String::valueOf).toList();
        }
        if (node instanceof String value && !value.isBlank()) {
            return List.of(value);
        }
        return List.of();
    }

    private boolean isOptionalMissingField(ServiceDraft draft, String fieldName) {
        return "serviceType".equals(fieldName) && isMissing(draft.getServiceType());
    }

    private List<String> buildReviewSummary(
            List<FieldValidationIssue> missingRequiredFields,
            List<FieldValidationIssue> flaggedFields
    ) {
        List<String> summary = new ArrayList<>();
        if (missingRequiredFields.isEmpty()) {
            summary.add("All required fields are present.");
        } else {
            summary.add(missingRequiredFields.size() + " required field(s) must be completed before confirmation.");
        }

        long reviewCount = flaggedFields.stream().filter(FieldValidationIssue::requiresReview).count();
        if (reviewCount > 0) {
            summary.add(reviewCount + " extracted field(s) need owner review.");
        } else {
            summary.add("No low-confidence extracted fields require review.");
        }
        return summary;
    }

    private boolean containsIssue(List<FieldValidationIssue> issues, String fieldName, String category) {
        return issues.stream().anyMatch(issue ->
                issue.fieldName().equals(fieldName) && issue.category().equals(category)
        );
    }

    private boolean containsAnyIssue(List<FieldValidationIssue> issues, String fieldName) {
        return issues.stream().anyMatch(issue -> issue.fieldName().equals(fieldName));
    }

    private boolean isMissing(Object value) {
        if (value == null) {
            return true;
        }
        return value instanceof String stringValue && stringValue.isBlank();
    }

    private String metadataSource(ServiceDraft draft) {
        Object source = draft.getFieldMetadata() == null ? null : draft.getFieldMetadata().get("source");
        return source == null ? null : String.valueOf(source);
    }

    private Double confidenceFor(ServiceDraft draft, String fieldName) {
        Object confidenceNode = draft.getFieldMetadata() == null ? null : draft.getFieldMetadata().get("confidence");
        if (confidenceNode instanceof Map<?, ?> confidenceMap) {
            return asDouble(confidenceMap.get(fieldName));
        }
        Object fieldConfidenceNode = draft.getFieldMetadata() == null ? null : draft.getFieldMetadata().get("fieldConfidence");
        if (fieldConfidenceNode instanceof Map<?, ?> fieldConfidenceMap) {
            Object value = fieldConfidenceMap.get(fieldName);
            if (value != null) {
                return switch (String.valueOf(value).toLowerCase(Locale.ROOT)) {
                    case "high" -> 0.9;
                    case "medium" -> 0.7;
                    case "low" -> 0.45;
                    case "not_found" -> 0.0;
                    default -> null;
                };
            }
        }
        return null;
    }

    private Double asDouble(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String stringValue) {
            try {
                return Double.parseDouble(stringValue);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private String labelFor(String fieldName) {
        return switch (fieldName) {
            case "vehicleId", "vehicleProfileId" -> "Vehicle profile";
            case "serviceDate" -> "Service date";
            case "serviceType" -> "Service type";
            case "odometer" -> "Odometer";
            case "totalCost", "cost" -> "Total cost";
            case "shopName" -> "Shop Name";
            case "location" -> "Location";
            case "partsReplaced" -> "Parts replaced";
            case "laborPerformed" -> "Labor performed";
            case "remarks" -> "Remarks";
            default -> titleCase(fieldName);
        };
    }

    private String titleCase(String fieldName) {
        String spaced = fieldName.replaceAll("([a-z])([A-Z])", "$1 $2").replace('_', ' ');
        if (spaced.isBlank()) {
            return "Field";
        }
        return spaced.substring(0, 1).toUpperCase(Locale.ROOT) + spaced.substring(1);
    }

    private Object valueForField(ServiceDraft draft, String fieldName) {
        return switch (fieldName) {
            case "vehicleId", "vehicleProfileId" -> draft.getVehicleId();
            case "serviceDate" -> draft.getServiceDate();
            case "serviceType" -> draft.getServiceType();
            case "odometer" -> draft.getOdometer();
            case "totalCost", "cost" -> draft.getTotalCost();
            case "shopName" -> draft.getShopName();
            case "location" -> draft.getLocation();
            case "partsReplaced" -> draft.getPartsReplaced();
            case "laborPerformed" -> draft.getLaborPerformed();
            case "remarks" -> draft.getRemarks();
            default -> null;
        };
    }
}
