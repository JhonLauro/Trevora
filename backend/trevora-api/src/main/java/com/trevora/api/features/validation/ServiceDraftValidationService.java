package com.trevora.api.features.validation;


import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.serviceinput.ServiceDraftItem;
import com.trevora.api.features.serviceinput.ServiceInputService;
import com.trevora.api.features.vehicle.VehicleProfile;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.features.validation.FieldValidationIssue;
import com.trevora.api.features.serviceinput.ServiceDraftResponse;
import com.trevora.api.features.validation.ServiceDraftReviewResponse;
import com.trevora.api.features.validation.ValidationResult;
import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import com.trevora.api.shared.exception.UnauthorizedVehicleAccessException;
import com.trevora.api.features.serviceinput.DocumentType;
import com.trevora.api.features.serviceinput.ServiceDraft;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ServiceDraftValidationService {
    /** Categories whose message is worth repeating in full, not just counting. */
    private static final Set<String> PLAUSIBILITY_CATEGORIES =
            Set.of("IMPLAUSIBLE_VALUE", "POSSIBLE_DUPLICATE");
    private static final List<FieldValidationRule> REQUIRED_RULES = List.of(
            new FieldValidationRule("vehicleId", "Vehicle profile", ServiceDraft::getVehicleId),
            new FieldValidationRule("serviceDate", "Service date", ServiceDraft::getServiceDate),
            new FieldValidationRule("totalCost", "Total cost", ServiceDraft::getTotalCost)
    );

    private final ServiceInputService serviceInputService;
    private final VehicleService vehicleService;
    private final CurrentUserService currentUserService;
    private final DraftPlausibilityService plausibilityService;

    public ServiceDraftValidationService(
            ServiceInputService serviceInputService,
            VehicleService vehicleService,
            CurrentUserService currentUserService,
            DraftPlausibilityService plausibilityService
    ) {
        this.serviceInputService = serviceInputService;
        this.vehicleService = vehicleService;
        this.currentUserService = currentUserService;
        this.plausibilityService = plausibilityService;
    }

    public ServiceDraftReviewResponse getDraftReview(UUID draftId) {
        currentUserService.requireVehicleOwner();
        ServiceDraft draft = serviceInputService.getDraftForCurrentUser(draftId);
        List<ServiceDraftItem> items = serviceInputService.getItemsForDraft(draftId);
        return new ServiceDraftReviewResponse(ServiceDraftResponse.from(draft, items), validateDraft(draft, items));
    }

    public ValidationResult validateDraftForCurrentUser(UUID draftId) {
        currentUserService.requireVehicleOwner();
        ServiceDraft draft = serviceInputService.getDraftForCurrentUser(draftId);
        return validateDraft(draft, serviceInputService.getItemsForDraft(draftId));
    }

    public ValidationResult validateDraft(ServiceDraft draft, List<ServiceDraftItem> items) {
        List<FieldValidationIssue> requiredFieldIssues = findMissingRequiredFields(draft, items);

        List<FieldValidationIssue> allFlags = new ArrayList<>();
        // Extraction confidence only means something when a model did the
        // extracting; a manual draft has a person behind every field.
        if (draft.getInputMethod() != InputMethod.MANUAL) {
            allFlags.addAll(findMetadataFlags(draft));
        }
        // Plausibility applies to every input method. A future date or an
        // odometer below the last reading is just as wrong when a person typed
        // it, and typing is where a transposed digit is most likely.
        allFlags.addAll(plausibilityService.check(draft, vehicleForDraft(draft)));

        // Absent and impossible are different problems. A blank total needs
        // filling in; a date next year needs correcting. Reporting both under
        // one heading meant the review screen filed a value that was present
        // under a heading reading "missing required fields".
        List<FieldValidationIssue> missing = requiredFieldIssues.stream()
                .filter(issue -> "MISSING_REQUIRED".equals(issue.category()))
                .toList();
        List<FieldValidationIssue> invalid = new ArrayList<>(requiredFieldIssues.stream()
                .filter(issue -> !"MISSING_REQUIRED".equals(issue.category()))
                .toList());
        // A future date is the one implausible value nothing legitimate
        // produces, so it blocks rather than warns.
        invalid.addAll(allFlags.stream().filter(FieldValidationIssue::blocksConfirmation).toList());

        List<FieldValidationIssue> warnings = allFlags.stream()
                .filter(issue -> !issue.blocksConfirmation())
                .toList();

        return new ValidationResult(
                draft.getDraftId(),
                missing.isEmpty() && invalid.isEmpty(),
                missing,
                invalid,
                warnings,
                buildReviewSummary(missing, invalid, warnings)
        );
    }

    /**
     * The vehicle a draft is filed against, or null when it cannot be loaded.
     *
     * <p>Plausibility is a nicety; validation working is not. A draft whose
     * vehicle has been deleted underneath it should still validate its own
     * fields rather than failing outright, so the odometer check simply loses
     * one of its two reference points.
     */
    private VehicleProfile vehicleForDraft(ServiceDraft draft) {
        if (draft.getVehicleId() == null) {
            return null;
        }
        try {
            return vehicleService.getVehicleForCurrentUser(draft.getVehicleId());
        } catch (RuntimeException exception) {
            return null;
        }
    }

    /**
     * Whether this draft came off a document that priced the visit and
     * described none of it.
     *
     * <p>An official receipt carries a total, a date and a PAID stamp, and not
     * one word about what was done to the car. Blocking confirmation on it was
     * asking the owner for something the paper never had - and the common case
     * is exactly this one, because people keep the receipt and throw the
     * invoice away.
     *
     * <p>So the empty services list stops being an error and becomes a warning:
     * the record is real, its cost is real, and the work is genuinely unknown.
     * What must never happen is the gap being filled by inference, which is why
     * the message asks the owner rather than offering a suggestion.
     */
    private boolean costOnlyDocument(ServiceDraft draft) {
        DocumentType documentType = draft.getDocumentType();
        return documentType != null && documentType.isCostOnly();
    }

    private List<FieldValidationIssue> findMissingRequiredFields(ServiceDraft draft, List<ServiceDraftItem> items) {
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
                        metadataSource(draft),
                        true,
                        true
                ));
            }
        }

        if (items == null || items.isEmpty()) {
            issues.add(costOnlyDocument(draft)
                    ? new FieldValidationIssue(
                            "services",
                            "Services performed",
                            "COST_ONLY_DOCUMENT",
                            "WARNING",
                            "This document records a payment but does not say what work was done."
                                    + " The cost is reliable. Add the services yourself if you know them"
                                    + " - they must not be guessed from the receipt.",
                            null,
                            metadataSource(draft),
                            false,
                            true)
                    : new FieldValidationIssue(
                            "services",
                            "Services performed",
                            "MISSING_REQUIRED",
                            "ERROR",
                            "At least one service performed must be added before confirmation.",
                            null,
                            metadataSource(draft),
                            true,
                            true));
        }

        if (draft.getVehicleId() != null) {
            try {
                vehicleService.verifyVehicleBelongsToCurrentUser(draft.getVehicleId());
            } catch (ResourceNotFoundException | UnauthorizedVehicleAccessException exception) {
                issues.add(new FieldValidationIssue(
                        "vehicleId",
                        "Vehicle profile",
                        "INVALID_REQUIRED",
                        "ERROR",
                        "Vehicle profile could not be verified for this owner.",
                        draft.getVehicleId(),
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

        // `fieldConfidence` is the only confidence extraction writes. A
        // numeric `confidence` map was read here too, which nothing has
        // produced since the mock provider was removed.
        Object fieldConfidenceNode = metadata.get("fieldConfidence");
        if (fieldConfidenceNode instanceof Map<?, ?> fieldConfidenceMap) {
            for (Map.Entry<?, ?> entry : fieldConfidenceMap.entrySet()) {
                String fieldName = String.valueOf(entry.getKey());
                String confidence = String.valueOf(entry.getValue()).toLowerCase(Locale.ROOT);
                if (containsAnyIssue(issues, fieldName)) {
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
            issues.add(new FieldValidationIssue(
                    fieldName,
                    labelFor(fieldName),
                    category,
                    severity,
                    labelFor(fieldName) + " " + messageSuffix,
                    valueForField(draft, fieldName),
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

    private List<String> buildReviewSummary(
            List<FieldValidationIssue> missingRequiredFields,
            List<FieldValidationIssue> invalidFields,
            List<FieldValidationIssue> flaggedFields
    ) {
        List<String> summary = new ArrayList<>();
        if (missingRequiredFields.isEmpty()) {
            summary.add("All required fields are present.");
        } else {
            summary.add(missingRequiredFields.size() + " required field(s) must be completed before confirmation.");
        }
        if (!invalidFields.isEmpty()) {
            summary.add(invalidFields.size() + " field(s) hold a value that cannot be right.");
        }

        long reviewCount = flaggedFields.stream().filter(FieldValidationIssue::requiresReview).count();
        if (reviewCount > 0) {
            summary.add(reviewCount + " extracted field(s) need owner review.");
        } else {
            summary.add("No low-confidence extracted fields require review.");
        }

        // Plausibility problems carry their explanation in the message, and the
        // counts above throw it away. They also do not all attach to a field the
        // review screen renders, so without this the duplicate warning would be
        // counted and never read.
        flaggedFields.stream()
                .filter(issue -> PLAUSIBILITY_CATEGORIES.contains(issue.category()))
                .map(FieldValidationIssue::message)
                .forEach(summary::add);

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



    private String labelFor(String fieldName) {
        return switch (fieldName) {
            case "vehicleId", "vehicleProfileId" -> "Vehicle profile";
            case "serviceDate" -> "Service date";
            case "services", "serviceType" -> "Services performed";
            case "odometer" -> "Odometer";
            case "totalCost", "cost" -> "Total cost";
            case "shopName" -> "Shop Name";
            case "location" -> "Location";
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
            case "odometer" -> draft.getOdometer();
            case "totalCost", "cost" -> draft.getTotalCost();
            case "shopName" -> draft.getShopName();
            case "location" -> draft.getLocation();
            case "remarks" -> draft.getRemarks();
            default -> null;
        };
    }
}
