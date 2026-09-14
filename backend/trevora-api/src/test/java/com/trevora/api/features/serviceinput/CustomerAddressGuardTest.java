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
}
