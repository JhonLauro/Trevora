package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Merging the documents of one visit.
 *
 * <p>The numbers here are one real Toyota Talisay visit on 2025-04-30, which is
 * the case that made this necessary. The repair order quotes ₱5,534.01, the
 * service invoice bills ₱3,106.49 for the identical work, and the official
 * receipt confirms ₱3,106.49 was paid while describing none of it. Photograph
 * all three and the old pipeline concatenated them into one block of text and
 * picked a number.
 *
 * <p>The tests are written as questions about which sheet is entitled to answer
 * for which field, because that is the actual design: precedence is per field,
 * and every test that treats a document as winning outright is testing the bug.
 */
class ReceiptDocumentMergerTest {

    private static final LocalDate VISIT = LocalDate.of(2025, 4, 30);

    @Test
    void theInvoicePricesTheVisitAndTheEstimateNeverDoes() {
        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(
                estimate("G7IA123581", "5534.01"),
                invoice("G7YA009184", "3106.49")));

        assertThat(merged.totalCost()).isEqualByComparingTo("3106.49");
        assertThat(merged.documentType()).isEqualTo(DocumentType.SERVICE_INVOICE);
    }

    @Test
    void theOrderOfThePhotographsDoesNotDecideTheCost() {
        // Same two documents, uploaded the other way round. If upload order can
        // change the total, the precedence is not doing anything.
        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(
                invoice("G7YA009184", "3106.49"),
                estimate("G7IA123581", "5534.01")));

        assertThat(merged.totalCost()).isEqualByComparingTo("3106.49");
    }

    @Test
    void anEstimateAloneStillKeepsItsQuote() {
        // Nothing outranks it, so the quote is the only figure there is. It is
        // still labelled an estimate, which is what stops it reading as paid.
        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(
                estimate("G7IA123581", "5534.01"),
                partsSlip("OIL FILTER")));

        assertThat(merged.totalCost()).isEqualByComparingTo("5534.01");
        assertThat(merged.documentType()).isEqualTo(DocumentType.ESTIMATE);
    }

    @Test
    void aReceiptPricesTheVisitWhenNoInvoiceWasPhotographed() {
        // The common case: owners keep the receipt and throw the invoice away.
        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(
                estimate("G7IA123581", "5534.01"),
                officialReceipt("OR124652", "3106.49")));

        assertThat(merged.totalCost()).isEqualByComparingTo("3106.49");
    }

    @Test
    void theWorkComesFromTheInvoiceEvenWhenTheReceiptPricedTheVisit() {
        // An official receipt outranks nothing for work: it describes none.
        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(
                officialReceipt("OR124652", "3106.49"),
                invoice("G7YA009184", "3106.49")));

        assertThat(merged.services()).hasSize(1);
        assertThat(merged.services().get(0).serviceType()).isEqualTo("Oil change");
    }

    @Test
    void workIsTakenFromOneDocumentRatherThanConcatenated() {
        // The estimate and the invoice list the same job. Adding both would bill
        // the owner twice for one oil change and make reconciliation impossible.
        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(
                estimate("G7IA123581", "5534.01"),
                invoice("G7YA009184", "3106.49")));

        assertThat(merged.services()).hasSize(1);
    }

    @Test
    void pagesOfOneInvoiceAreJoinedRatherThanTreatedAsRivals() {
        // A three-page invoice is one document. Its lines belong together, and
        // the document number is what proves they do.
        ReceiptDraftFields pageOne = invoice("G7YA009184", "3106.49");
        ReceiptDraftFields pageTwo = new ReceiptDraftFields(
                DocumentType.SERVICE_INVOICE, "G7YA009184", List.of(), VISIT,
                List.of(service("Brake inspection")), null, null, null, null, null,
                List.of(), Map.of(), Map.of(), List.of(), null, List.of(), null, null);

        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(pageOne, pageTwo));

        assertThat(merged.services())
                .extracting(ServiceItemFields::serviceType)
                .containsExactly("Oil change", "Brake inspection");
    }

    @Test
    void documentsWithNoNumberAreNeverAssumedToBeTheSameDocument() {
        // Two untitled sheets from a small shop could be one receipt or two
        // unrelated ones. Joining them on a guess is the failure this prevents.
        ReceiptDraftFields first = untitled("500.00");
        ReceiptDraftFields second = untitled("750.00");

        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(first, second));

        assertThat(merged.services()).hasSize(1);
        assertThat(merged.totalCost()).isEqualByComparingTo("500.00");
    }

    @Test
    void theOwnerIsToldWhichSheetTheCostCameFrom() {
        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(
                estimate("G7IA123581", "5534.01"),
                invoice("G7YA009184", "3106.49")));

        assertThat(merged.warnings())
                .anyMatch(warning -> warning.contains("2 separate documents"))
                .anyMatch(warning -> warning.contains("cost was taken from the service invoice"))
                .anyMatch(warning -> warning.contains("5534.01") && warning.contains("not what was paid"));
    }

    @Test
    void theOdometerTheDocumentsAgreeOnWins() {
        // A repair order prints the mileage, the warranty expiry kilometres and
        // the next service interval, all shaped like an odometer. Agreement
        // across sheets is the cheapest evidence that the right one was read.
        ReceiptDraftFields wrong = withOdometer(estimate("G7IA123581", "5534.01"), 100000);
        ReceiptDraftFields right = withOdometer(invoice("G7YA009184", "3106.49"), 242);
        ReceiptDraftFields alsoRight = withOdometer(partsSlip("OIL FILTER"), 242);

        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(wrong, right, alsoRight));

        assertThat(merged.odometer()).isEqualTo(242);
    }

    @Test
    void aDisagreementAboutTheOdometerIsReportedRatherThanResolvedQuietly() {
        ReceiptDraftFields wrong = withOdometer(estimate("G7IA123581", "5534.01"), 3);
        ReceiptDraftFields right = withOdometer(partsSlip("OIL FILTER"), 242);

        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(wrong, right));

        assertThat(merged.warnings())
                .anyMatch(warning -> warning.contains("disagree about the odometer")
                        && warning.contains("3") && warning.contains("242"));
    }

    @Test
    void aTiedOdometerFallsBackToTheRankingRatherThanToTheSmallestNumber() {
        // One reading each, so there is no agreement to go on. The ranking is
        // the answer every other field here already uses; preferring the larger
        // or smaller number would be a rule invented to fit one receipt, and the
        // larger-wins version picks a 100,000 km warranty limit on the next one.
        ReceiptDraftFields fromEstimate = withOdometer(estimate("G7IA123581", "5534.01"), 3);
        ReceiptDraftFields fromSlip = withOdometer(partsSlip("OIL FILTER"), 242);

        assertThat(ReceiptDocumentMerger.merge(List.of(fromEstimate, fromSlip)).odometer())
                .isEqualTo(3);
        assertThat(ReceiptDocumentMerger.merge(List.of(fromSlip, fromEstimate)).odometer())
                .isEqualTo(3);
    }

    @Test
    void aMajorityStillBeatsTheRanking() {
        // Two documents agreeing outrank one that does not, even when the odd
        // one out came off a higher-ranked sheet. Agreement is the stronger
        // evidence and the ranking is only there when agreement is absent.
        ReceiptDraftFields fromInvoice = withOdometer(invoice("G7YA009184", "3106.49"), 999);
        ReceiptDraftFields fromEstimate = withOdometer(estimate("G7IA123581", "5534.01"), 242);
        ReceiptDraftFields fromSlip = withOdometer(partsSlip("OIL FILTER"), 242);

        assertThat(ReceiptDocumentMerger.merge(List.of(fromInvoice, fromEstimate, fromSlip)).odometer())
                .isEqualTo(242);
    }

    @Test
    void everyDocumentNumberInTheVisitIsKeptSoThePaperworkCanBeFoundAgain() {
        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(
                estimate("G7IA123581", "5534.01"),
                invoice("G7YA009184", "3106.49")));

        assertThat(merged.referenceNumbers()).contains("G7IA123581", "G7YA009184");
    }

    @Test
    void oneDocumentPassesStraightThroughUnchanged() {
        ReceiptDraftFields only = invoice("G7YA009184", "3106.49");

        assertThat(ReceiptDocumentMerger.merge(List.of(only))).isSameAs(only);
    }

    @Test
    void nothingExtractableMergesToNothingRatherThanThrowing() {
        assertThat(ReceiptDocumentMerger.merge(List.of())).isNull();
        assertThat(ReceiptDocumentMerger.merge(null)).isNull();
    }

    @Test
    void aReceiptAloneStaysCostOnlyRatherThanBorrowingWork() {
        // Nothing in the upload describes work, so the merged draft must not
        // acquire any. This is the cost-only record the confirmation flow and
        // the explanation guard both depend on.
        ReceiptDraftFields merged = ReceiptDocumentMerger.merge(List.of(
                officialReceipt("OR124652", "3106.49"),
                officialReceipt("OR124653", "3106.49")));

        assertThat(merged.services()).isEmpty();
        assertThat(merged.totalCost()).isEqualByComparingTo("3106.49");
    }

    private static ReceiptDraftFields invoice(String number, String total) {
        return document(DocumentType.SERVICE_INVOICE, number, total, List.of(service("Oil change")));
    }

    private static ReceiptDraftFields estimate(String number, String total) {
        return document(DocumentType.ESTIMATE, number, total, List.of(service("Oil change")));
    }

    private static ReceiptDraftFields officialReceipt(String number, String total) {
        return document(DocumentType.OFFICIAL_RECEIPT, number, total, List.of());
    }

    private static ReceiptDraftFields partsSlip(String part) {
        return document(DocumentType.PARTS_SLIP, null, null, List.of(service(part)));
    }

    private static ReceiptDraftFields untitled(String total) {
        return document(DocumentType.SERVICE_INVOICE, null, total, List.of(service("Repair")));
    }

    private static ReceiptDraftFields withOdometer(ReceiptDraftFields source, int odometer) {
        return new ReceiptDraftFields(
                source.documentType(), source.documentNumber(), source.referenceNumbers(),
                source.serviceDate(), source.services(), odometer, source.totalCost(),
                source.shopName(), source.location(), source.remarks(), source.confidenceNotes(),
                source.fieldSources(), source.fieldConfidence(), source.aiSuggestedFields(),
                source.classification(), source.warnings(), null, null);
    }

    private static ReceiptDraftFields document(
            DocumentType type, String number, String total, List<ServiceItemFields> services) {
        return new ReceiptDraftFields(
                type,
                number,
                List.of(),
                VISIT,
                services,
                null,
                total == null ? null : new BigDecimal(total),
                "Toyota Talisay, Cebu",
                "City of Talisay, Cebu",
                null,
                List.of(),
                Map.of(),
                Map.of(),
                List.of(),
                null,
                List.of(), null, null);
    }

    private static ServiceItemFields service(String serviceType) {
        return new ServiceItemFields(serviceType, null, null, null, List.of(), null);
    }
}
