package com.trevora.api.features.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.trevora.api.features.serviceinput.DocumentType;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordItem;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * The guard that stops Module 4 explaining a record that describes no work.
 *
 * <p>An owner can confirm a record from an official receipt: a real payment, a
 * real date, and nothing anywhere about what was done to the car. Without this
 * guard both explanation paths would answer anyway. The model, handed a Toyota
 * letterhead and ₱3,106.49, writes a confident paragraph about routine
 * maintenance. The template needs no model at all - it defaults its service
 * summary to the words "service work" and produces the same shape of sentence.
 *
 * <p>Neither was told anything about the work, because the paper said nothing
 * about the work. An owner reading a fluent paragraph cannot tell that apart
 * from a real explanation, which is what makes this the dangerous failure
 * rather than merely an unhelpful one.
 */
class CostOnlyExplanationTest {

    @Test
    void aReceiptWithNoWorkIsNotExplained() {
        ServiceRecord record = record(DocumentType.OFFICIAL_RECEIPT);

        assertThat(nothingToExplain(record, List.of())).isTrue();
    }

    @Test
    void aRecordThatCarriesWorkIsExplainedNormally() {
        ServiceRecord record = record(DocumentType.SERVICE_INVOICE);

        assertThat(nothingToExplain(record, List.of(new ServiceRecordItem()))).isFalse();
    }

    @Test
    void itemsWinOverTheDocumentType() {
        // The honest condition is "no work recorded", not "came off a receipt".
        // An owner who typed the services in by hand after uploading a receipt
        // has a record worth explaining, whatever the paper was.
        ServiceRecord record = record(DocumentType.OFFICIAL_RECEIPT);

        assertThat(nothingToExplain(record, List.of(new ServiceRecordItem()))).isFalse();
    }

    @Test
    void anEmptyInvoiceIsAlsoNotExplained() {
        // A SERVICE_INVOICE carries work, so an empty one is a record whose
        // items failed to save rather than a document that never had any.
        // Explaining it would still be inventing, so the guard holds.
        ServiceRecord record = record(DocumentType.SERVICE_INVOICE);

        assertThat(nothingToExplain(record, List.of())).isFalse();
    }

    @Test
    void anInspectionReportIsNotExplainedAsWorkPerformed() {
        // A battery slip says the battery was measured, not replaced.
        ServiceRecord record = record(DocumentType.INSPECTION_REPORT);

        assertThat(nothingToExplain(record, List.of())).isTrue();
    }

    @Test
    void theCostOnlyAnswerAdmitsWhatItDoesNotKnowAndOffersNoAdvice() {
        ServiceRecord record = record(DocumentType.OFFICIAL_RECEIPT);

        AIExplanationResponse response = costOnlyExplanation(record);

        assertThat(response.whatWasDone())
                .contains("shows the payment but not the work");
        // No watch-for advice and no details: both would have to be invented
        // from the same nothing.
        assertThat(response.watchFor()).isEmpty();
        assertThat(response.details()).isEmpty();
        // Not a fallback. Nothing failed - this is the correct and complete
        // answer, and flagging it as a degraded one would invite someone to
        // "fix" it by generating text.
        assertThat(response.fallback()).isFalse();
        assertThat(response.source()).isEqualTo("cost_only");
        assertThat(response.disclaimer()).isNotBlank();
    }

    private static ServiceRecord record(DocumentType documentType) {
        // recordId is database-generated and has no setter, so it stays null
        // here. Nothing under test reads it beyond copying it into the response.
        ServiceRecord record = new ServiceRecord();
        record.setVehicleId(UUID.randomUUID());
        record.setDocumentType(documentType);
        record.setTotalCost(new BigDecimal("3106.49"));
        return record;
    }

    private static boolean nothingToExplain(ServiceRecord record, List<ServiceRecordItem> items) {
        return (boolean) invoke("nothingToExplain", record, items);
    }

    private static AIExplanationResponse costOnlyExplanation(ServiceRecord record) {
        return (AIExplanationResponse) invoke("costOnlyExplanation", record);
    }

    /**
     * Reached reflectively so the guard can be tested without standing up the
     * repositories, the vehicle service and the OpenAI provider that
     * {@link AIExplanationService} needs to construct. The behaviour under test
     * is a decision about two values, not a collaboration.
     */
    private static Object invoke(String name, Object... args) {
        try {
            Class<?>[] signature = args.length == 2
                    ? new Class<?>[] {ServiceRecord.class, List.class}
                    : new Class<?>[] {ServiceRecord.class};
            Method method = AIExplanationService.class.getDeclaredMethod(name, signature);
            method.setAccessible(true);
            // Null collaborators are safe here: neither method touches them.
            return method.invoke(new AIExplanationService(null, null, null, null, null), args);
        } catch (ReflectiveOperationException exception) {
            throw new RuntimeException(exception);
        }
    }
}
