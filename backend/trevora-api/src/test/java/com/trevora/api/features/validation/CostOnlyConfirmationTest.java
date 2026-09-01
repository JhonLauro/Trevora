package com.trevora.api.features.validation;

import static org.assertj.core.api.Assertions.assertThat;

import com.trevora.api.features.serviceinput.DocumentType;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftItem;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Whether an empty services list blocks confirmation.
 *
 * <p>It used to, always. That was right for every document the pipeline had
 * seen, and wrong for the one owners are most likely to keep: an official
 * receipt carries a total, a date and a PAID stamp, and not one word about what
 * was done to the car. Blocking on it asked the owner to supply something the
 * paper never had, on the most common upload there is - people keep the receipt
 * and throw the invoice away.
 *
 * <p>So a cost-only document warns instead of blocking. The record is real and
 * its cost is real; the work is genuinely unknown and stays that way. The
 * message deliberately asks the owner rather than offering a suggestion,
 * because the one thing that must never happen is the gap being filled by
 * inference.
 */
class CostOnlyConfirmationTest {

    @Test
    void anOfficialReceiptWithNoServicesCanStillBeConfirmed() {
        List<FieldValidationIssue> issues = findMissingRequiredFields(
                draft(DocumentType.OFFICIAL_RECEIPT), List.of());

        FieldValidationIssue services = issueFor(issues, "services");
        assertThat(services).isNotNull();
        assertThat(services.blocksConfirmation()).isFalse();
        assertThat(services.severity()).isEqualTo("WARNING");
        assertThat(services.category()).isEqualTo("COST_ONLY_DOCUMENT");
    }

    @Test
    void theWarningAsksTheOwnerRatherThanOfferingAGuess() {
        List<FieldValidationIssue> issues = findMissingRequiredFields(
                draft(DocumentType.OFFICIAL_RECEIPT), List.of());

        FieldValidationIssue services = issueFor(issues, "services");
        assertThat(services.message())
                .contains("does not say what work was done")
                .contains("must not be guessed");
        // It still wants the owner's eyes on it, just not as a blocker.
        assertThat(services.requiresReview()).isTrue();
    }

    @Test
    void anOrdinaryInvoiceWithNoServicesStillBlocks() {
        // Nothing about this change loosens the normal case. An invoice that
        // came back with no lines is an extraction that failed, and confirming
        // it would store a cost with the work silently missing.
        List<FieldValidationIssue> issues = findMissingRequiredFields(
                draft(DocumentType.SERVICE_INVOICE), List.of());

        FieldValidationIssue services = issueFor(issues, "services");
        assertThat(services.blocksConfirmation()).isTrue();
        assertThat(services.category()).isEqualTo("MISSING_REQUIRED");
    }

    @Test
    void anEstimateWithNoServicesStillBlocks() {
        // An estimate describes work by definition, so an empty one is a
        // failed read rather than a document with nothing to say.
        List<FieldValidationIssue> issues = findMissingRequiredFields(
                draft(DocumentType.ESTIMATE), List.of());

        assertThat(issueFor(issues, "services").blocksConfirmation()).isTrue();
    }

    @Test
    void aDraftWithServicesRaisesNoServicesIssueAtAll() {
        List<FieldValidationIssue> issues = findMissingRequiredFields(
                draft(DocumentType.OFFICIAL_RECEIPT), List.of(new ServiceDraftItem()));

        assertThat(issueFor(issues, "services")).isNull();
    }

    private static ServiceDraft draft(DocumentType documentType) {
        ServiceDraft draft = new ServiceDraft();
        draft.setDocumentType(documentType);
        return draft;
    }

    private static FieldValidationIssue issueFor(List<FieldValidationIssue> issues, String field) {
        return issues.stream()
                .filter(issue -> field.equals(issue.fieldName()))
                .findFirst()
                .orElse(null);
    }

    /**
     * Reached reflectively so the rule can be tested without the vehicle
     * service and repositories {@link ServiceDraftValidationService} needs to
     * construct. The behaviour under test is a decision about a draft and a
     * list, not a collaboration.
     */
    @SuppressWarnings("unchecked")
    private static List<FieldValidationIssue> findMissingRequiredFields(
            ServiceDraft draft, List<ServiceDraftItem> items) {
        try {
            Method method = ServiceDraftValidationService.class.getDeclaredMethod(
                    "findMissingRequiredFields", ServiceDraft.class, List.class);
            method.setAccessible(true);
            ServiceDraftValidationService service =
                    new ServiceDraftValidationService(null, null, null, null);
            return (List<FieldValidationIssue>) method.invoke(service, draft, items);
        } catch (ReflectiveOperationException exception) {
            throw new RuntimeException(exception);
        }
    }
}
