package com.trevora.api.features.validation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftItem;
import com.trevora.api.features.serviceinput.ServiceInputService;
import com.trevora.api.features.vehicle.VehicleProfile;
import com.trevora.api.features.vehicle.VehicleService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * How a draft's problems are sorted, which is what the review screen reads.
 *
 * <p>Absent and impossible used to arrive in one list, so a service date set
 * next year — a value that is present, and wrong — was filed under a heading
 * reading "missing required fields". They are separated here, and a blocking
 * problem appears in exactly one list so nothing counts it twice.
 */
class ServiceDraftValidationServiceTest {

    private static final UUID VEHICLE = UUID.randomUUID();

    private ServiceDraftValidationService service;

    @BeforeEach
    void setUp() {
        ServiceInputService input = mock(ServiceInputService.class);
        VehicleService vehicles = mock(VehicleService.class);
        CurrentUserService users = mock(CurrentUserService.class);
        DraftPlausibilityService plausibility =
                new DraftPlausibilityService(
                        mock(com.trevora.api.features.servicerecord.ServiceRecordRepository.class),
                        mock(com.trevora.api.features.serviceinput.ServiceDraftRepository.class));

        VehicleProfile profile = new VehicleProfile();
        when(vehicles.getVehicleForCurrentUser(any())).thenReturn(profile);

        service = new ServiceDraftValidationService(input, vehicles, users, plausibility);
    }

    @Test
    void aBlankRequiredFieldIsMissing() {
        ServiceDraft draft = draft(LocalDate.now(), null);

        ValidationResult result = service.validateDraft(draft, items());

        assertThat(result.missingRequiredFields()).extracting(FieldValidationIssue::fieldName)
                .containsExactly("totalCost");
        assertThat(result.invalidFields()).isEmpty();
        assertThat(result.valid()).isFalse();
    }

    @Test
    void aDateNextYearIsInvalidRatherThanMissing() {
        ServiceDraft draft = draft(LocalDate.now().plusYears(1), BigDecimal.valueOf(2500));

        ValidationResult result = service.validateDraft(draft, items());

        assertThat(result.missingRequiredFields())
                .as("the date is present, so nothing about it is missing")
                .isEmpty();
        assertThat(result.invalidFields()).extracting(FieldValidationIssue::fieldName)
                .containsExactly("serviceDate");
        assertThat(result.valid()).isFalse();
    }

    @Test
    void aBlockingProblemIsNotAlsoCountedAsAWarning() {
        ValidationResult result = service.validateDraft(draft(LocalDate.now().plusYears(1), BigDecimal.TEN), items());

        assertThat(result.flaggedFields())
                .as("flaggedFields is warnings only")
                .allSatisfy(issue -> assertThat(issue.blocksConfirmation()).isFalse());
    }

    @Test
    void aCompleteDraftIsValid() {
        ValidationResult result = service.validateDraft(draft(LocalDate.now(), BigDecimal.valueOf(2500)), items());

        assertThat(result.missingRequiredFields()).isEmpty();
        assertThat(result.invalidFields()).isEmpty();
        assertThat(result.valid()).isTrue();
        assertThat(result.reviewSummary()).contains("All required fields are present.");
    }

    @Test
    void aDraftWithNoServicesCannotBeConfirmed() {
        ValidationResult result = service.validateDraft(draft(LocalDate.now(), BigDecimal.TEN), List.of());

        assertThat(result.missingRequiredFields()).extracting(FieldValidationIssue::fieldName)
                .containsExactly("services");
        assertThat(result.valid()).isFalse();
    }

    /**
     * The categorical confidence extraction actually writes. The numeric map
     * that used to be read alongside it has been gone since the mock provider
     * was removed; a draft carrying only the real shape must still produce
     * flags.
     */
    @Test
    void categoricalFieldConfidenceStillProducesFlags() {
        ServiceDraft draft = draft(LocalDate.now(), BigDecimal.valueOf(2500));
        draft.setInputMethod(InputMethod.RECEIPT);
        draft.setFieldMetadata(Map.of("fieldConfidence", Map.of(
                "shopName", "low",
                "location", "not_found",
                "serviceDate", "high"
        )));

        ValidationResult result = service.validateDraft(draft, items());

        assertThat(result.flaggedFields()).extracting(FieldValidationIssue::fieldName)
                .contains("shopName", "location", "serviceDate");
        assertThat(result.flaggedFields())
                .filteredOn(issue -> "shopName".equals(issue.fieldName()))
                .singleElement()
                .satisfies(issue -> {
                    assertThat(issue.category()).isEqualTo("LOW_CONFIDENCE");
                    assertThat(issue.requiresReview()).isTrue();
                });
        assertThat(result.flaggedFields())
                .filteredOn(issue -> "serviceDate".equals(issue.fieldName()))
                .singleElement()
                .satisfies(issue -> {
                    assertThat(issue.category()).isEqualTo("SOURCE_FIELD");
                    assertThat(issue.requiresReview())
                            .as("a cleanly read field is information, not a task")
                            .isFalse();
                });
    }

    private ServiceDraft draft(LocalDate serviceDate, BigDecimal totalCost) {
        ServiceDraft draft = new ServiceDraft();
        draft.setVehicleId(VEHICLE);
        draft.setInputMethod(InputMethod.MANUAL);
        draft.setServiceDate(serviceDate);
        draft.setTotalCost(totalCost);
        return draft;
    }

    private List<ServiceDraftItem> items() {
        ServiceDraftItem item = new ServiceDraftItem();
        item.setServiceType("Oil change");
        item.setSortOrder(0);
        return List.of(item);
    }
}
