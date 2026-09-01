package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The rules that decide whether a stored amount is money that changed hands.
 *
 * <p>These look trivial and are not. The default in particular is load-bearing
 * in a direction that is easy to get backwards: every draft written before this
 * field existed, every voice draft, and every extraction the classifier could
 * not read has to keep its cost. A default of {@code ESTIMATE} would have
 * silently demoted the entire existing history to "quoted, not paid" the moment
 * this shipped.
 */
class DocumentTypeTest {

    @Test
    void unknownInputKeepsItsCostRatherThanBecomingAnEstimate() {
        assertThat(DocumentType.fromNullable(null)).isEqualTo(DocumentType.SERVICE_INVOICE);
        assertThat(DocumentType.fromNullable("")).isEqualTo(DocumentType.SERVICE_INVOICE);
        assertThat(DocumentType.fromNullable("   ")).isEqualTo(DocumentType.SERVICE_INVOICE);
        assertThat(DocumentType.fromNullable("SOMETHING_NEW")).isEqualTo(DocumentType.SERVICE_INVOICE);

        assertThat(DocumentType.SERVICE_INVOICE.isCostAuthoritative()).isTrue();
    }

    @Test
    void readsAStoredNameInAnyCasing() {
        assertThat(DocumentType.fromNullable("estimate")).isEqualTo(DocumentType.ESTIMATE);
        assertThat(DocumentType.fromNullable(" Official_Receipt ")).isEqualTo(DocumentType.OFFICIAL_RECEIPT);
    }

    @Test
    void anEstimateNeverPricesTheVisit() {
        // The Talisay repair order printed 5,534.01 for work the invoice billed
        // at 3,106.49. Both look like totals; only the document type separates
        // them.
        assertThat(DocumentType.ESTIMATE.isCostAuthoritative()).isFalse();
        assertThat(DocumentType.ESTIMATE.carriesWork()).isTrue();
    }

    @Test
    void anOfficialReceiptPricesTheVisitButDescribesNoneOfIt() {
        assertThat(DocumentType.OFFICIAL_RECEIPT.isCostAuthoritative()).isTrue();
        assertThat(DocumentType.OFFICIAL_RECEIPT.carriesWork()).isFalse();
        assertThat(DocumentType.OFFICIAL_RECEIPT.isCostOnly()).isTrue();
    }

    @Test
    void onlyTheReceiptOnlyDocumentIsCostOnly() {
        assertThat(DocumentType.SERVICE_INVOICE.isCostOnly()).isFalse();
        assertThat(DocumentType.ESTIMATE.isCostOnly()).isFalse();
        assertThat(DocumentType.WORK_PERFORMED.isCostOnly()).isFalse();
        assertThat(DocumentType.PARTS_SLIP.isCostOnly()).isFalse();
        assertThat(DocumentType.INSPECTION_REPORT.isCostOnly()).isFalse();
        assertThat(DocumentType.PARTS_PURCHASE.isCostOnly()).isFalse();
        assertThat(DocumentType.NOT_A_RECEIPT.isCostOnly()).isFalse();
    }

    @Test
    void aFindingAboutTheVehicleIsNotWorkDoneToIt() {
        // A battery slip reading 56% state of health says the battery was
        // measured, not that it was replaced. Filing it as work performed would
        // tell the next mechanic the problem had been dealt with.
        assertThat(DocumentType.INSPECTION_REPORT.carriesWork()).isFalse();
        assertThat(DocumentType.INSPECTION_REPORT.isCostAuthoritative()).isFalse();
        assertThat(DocumentType.INSPECTION_REPORT.isCostOnly()).isFalse();
    }

    @Test
    void goodsBoughtOverTheCounterArePricedButNotWorkDone() {
        // A battery bought and taken home is real money and real history - what
        // it is not is evidence that anyone fitted it.
        assertThat(DocumentType.PARTS_PURCHASE.isCostAuthoritative()).isTrue();
        // carriesWork is true because the goods are content worth recording, so
        // an empty parts purchase is a failed read rather than a document with
        // nothing on it. The claim it must never make is that the part was
        // installed, and that lives in the wording shown to the owner rather
        // than in this flag.
        assertThat(DocumentType.PARTS_PURCHASE.carriesWork()).isTrue();
        assertThat(DocumentType.PARTS_PURCHASE.isCostOnly()).isFalse();
    }

    @Test
    void documentsWithoutPricesCannotPriceAnything() {
        assertThat(DocumentType.WORK_PERFORMED.isCostAuthoritative()).isFalse();
        assertThat(DocumentType.PARTS_SLIP.isCostAuthoritative()).isFalse();
        assertThat(DocumentType.NOT_A_RECEIPT.isCostAuthoritative()).isFalse();
        assertThat(DocumentType.NOT_A_RECEIPT.carriesWork()).isFalse();
    }
}
