package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The shop's address may be kept; the customer's may not.
 *
 * <p>Invented names and addresses throughout. The receipt that showed the problem
 * (Gateway / Mercedes-Benz Cebu) belongs to a real person and stays out of git;
 * these reproduce its layout: the label, a name, then the address three lines
 * down with other cells run into the same rows.
 */
class CustomerAddressGuardTest {

    private static final String REPAIR_ORDER = """
            SAMPLE MOTORS
            HOME OF THE SAMPLE DEALS
            Customer No. | Customer Name and Address | Plate No. | Advisor
            1234567 | Juan Dela Cruz | ABC1234 | 0120
            Mode of Payment | Km Reading | Next Svc Date
            12 Mango Avenue , Lahug , Cebu City | 20,663 | 13 May 2026
            Email: | Year/Make | Model
            """;

    @Test
    void rejectsTheAddressFromTheCustomersBox() {
        assertThat(CustomerAddressGuard.readsFromCustomerBlock(REPAIR_ORDER, "12 Mango Avenue, Lahug, Cebu City"))
                .isTrue();
    }

    /** The model joined the address to a word from the next cell; the start still matches. */
    @Test
    void rejectsItWhenTheModelStitchedOnANeighbouringCell() {
        assertThat(CustomerAddressGuard.readsFromCustomerBlock(REPAIR_ORDER, "12 Mango Avenue, Lahug, Cebu City, Email"))
                .isTrue();
    }

    @Test
    void keepsAShopAddressPrintedInTheHeader() {
        String invoice = """
                SAMPLE AUTO SERVICES
                88 National Highway , Talamban , Cebu City
                Sold To: Juan Dela Cruz
                Address: 12 Mango Avenue , Lahug , Cebu City
                """;

        assertThat(CustomerAddressGuard.readsFromCustomerBlock(invoice, "88 National Highway, Talamban, Cebu City"))
                .isFalse();
    }

    /** A city name alone is shared by the shop and the customer; it proves nothing. */
    @Test
    void doesNotRejectOnAShortCommonWord() {
        assertThat(CustomerAddressGuard.readsFromCustomerBlock(REPAIR_ORDER, "Cebu")).isFalse();
    }

    @Test
    void keepsALocationOnAReceiptWithNoCustomerBox() {
        assertThat(CustomerAddressGuard.readsFromCustomerBlock("RJ MOTOR PARTS\nPoblacion, Talisay City", "Poblacion, Talisay City"))
                .isFalse();
    }

    /**
     * The golden fixture written for this, rather than only the receipt invented
     * above: a customer block with name, address and mobile, and a letterhead
     * with no address at all, so the only address on the page is the wrong one.
     */
    @Test
    void rejectsTheCustomerAddressInTheGoldenFixture() {
        assertThat(CustomerAddressGuard.readsFromCustomerBlock(
                goldenOcr("synthetic-customer-block"),
                "7 Rizal Extension, Barangay Ilaya, San Fabian"))
                .isTrue();
    }

    /**
     * The same page with the block's heading removed, which is a documented limit:
     * with nothing saying whose details these are, only the prompt stands between
     * that address and the location field. Pinned so the limit is measured rather
     * than assumed, and so this test fails loudly if the guard ever starts
     * catching it by other means.
     */
    @Test
    void missesAnUnlabelledCustomerBlock() {
        assertThat(CustomerAddressGuard.readsFromCustomerBlock(
                goldenOcr("synthetic-customer-block-unlabelled"),
                "7 Rizal Extension, Barangay Ilaya, San Fabian"))
                .isFalse();
    }

    private static String goldenOcr(String caseId) {
        try (java.io.InputStream stream = CustomerAddressGuardTest.class.getClassLoader()
                .getResourceAsStream("golden/" + caseId + "/ocr.txt")) {
            if (stream == null) {
                throw new IllegalStateException("Missing golden fixture: " + caseId);
            }
            return new String(stream.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        } catch (java.io.IOException exception) {
            throw new java.io.UncheckedIOException(exception);
        }
    }
}
