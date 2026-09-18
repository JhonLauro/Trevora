package com.trevora.api.features.serviceinput;

import java.util.List;
import java.util.Locale;

/**
 * Catches a "location" that is really the customer's home address.
 *
 * <p>Dealer repair orders print a box headed "Customer Name and Address", and the
 * model has repeatedly taken the address in it as the shop's location: on the
 * Gateway / Mercedes-Benz Cebu repair order it did so on every upload, whatever
 * the prompt said. That is a wrong value and a privacy problem at once, because
 * a record can be shared with a mechanic. A prompt instruction alone does not
 * hold across runs, so this checks the answer against the page.
 *
 * <p><b>The rule.</b> If the extracted location appears in the few lines of OCR
 * text that follow a customer-address label, it came from the customer's box and
 * is not kept. Letters and digits only are compared, because OCR scatters spaces,
 * commas and cell separators ("22 E , Cebu Business Park |") differently on every
 * read. Only the start of the location is matched: a location the model stitched
 * together from two cells ("... Luz Cebu Cebu City") still begins with what the
 * box printed.
 *
 * <p><b>Known limits.</b> Two, both deliberate and neither closed:
 * an unlabelled customer block is invisible to this -- plenty of forms print
 * the customer's details with no heading at all -- and so is an address
 * sitting further than {@link #LINES_AFTER_LABEL} lines below its label,
 * which a tall or badly rebuilt table can do. Widening either one trades a
 * missed customer address for a blanked shop address, and no receipt seen so
 * far needs it. The label list has the same shape of gap: it covers the
 * headings seen on real paper, not every heading that exists.
 */
final class CustomerAddressGuard {

    /** Labels that head a customer's details rather than the shop's. */
    private static final List<String> CUSTOMER_LABELS = List.of(
            "customer name and address", "customer address", "customer name",
            "sold to", "bill to", "billed to", "ship to", "owner's address", "owner address");

    /** How far below a label the customer's address can sit. On Gateway it was three lines. */
    private static final int LINES_AFTER_LABEL = 6;

    /** Enough of the location to be sure it is the same text, not a shared word like "Cebu". */
    private static final int MATCH_CHARS = 16;

    private CustomerAddressGuard() {
    }

    static boolean readsFromCustomerBlock(String ocrText, String location) {
        if (ocrText == null || location == null) {
            return false;
        }
        String wanted = letters(location);
        if (wanted.length() < 8) {
            return false;
        }
        String prefix = wanted.substring(0, Math.min(MATCH_CHARS, wanted.length()));

        String lower = ocrText.toLowerCase(Locale.ROOT);
        for (String label : CUSTOMER_LABELS) {
            int from = 0;
            int at;
            while ((at = lower.indexOf(label, from)) >= 0) {
                if (letters(windowAfter(ocrText, at + label.length())).contains(prefix)) {
                    return true;
                }
                from = at + label.length();
            }
        }
        return false;
    }

    /** The rest of the label's line and the next few lines. */
    private static String windowAfter(String text, int start) {
        int end = start;
        for (int line = 0; line <= LINES_AFTER_LABEL && end < text.length(); line++) {
            int next = text.indexOf('\n', end);
            end = next < 0 ? text.length() : next + 1;
        }
        return text.substring(start, end);
    }

    private static String letters(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }
}
