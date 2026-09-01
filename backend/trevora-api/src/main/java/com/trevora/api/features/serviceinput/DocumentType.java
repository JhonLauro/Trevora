package com.trevora.api.features.serviceinput;

/**
 * What kind of paper the owner photographed.
 *
 * <p><b>Why this exists.</b> Extraction treated every uploaded document as
 * interchangeable — the prompt opened by naming "receipts, invoices, job orders,
 * and official receipts" in one breath and then read them all the same way. They
 * are not the same. A single Toyota Talisay visit produced a Repair Order
 * totalling ₱5,534.01 and a Service Invoice totalling ₱3,106.49, and the Repair
 * Order says in its own print that it is only an estimate. Photograph the wrong
 * sheet of the same stack and the vehicle's history gained ₱2,427.52 of work
 * that never happened, stored as fact and later explained to a mechanic in
 * confident prose.
 *
 * <p><b>The rule that keeps this from breaking the small shops.</b> A talyer
 * hands over one piece of paper that is the invoice and the receipt at once. It
 * has no BIR boilerplate, no document title worth trusting, and often no title
 * at all. So the classification is deliberately asymmetric:
 * {@link #SERVICE_INVOICE} is the default, and every other type must be earned
 * by positive printed evidence. Absence of evidence is not evidence of an
 * estimate. That way the dealership stack — the only place where the estimate
 * and the final bill are separate sheets — is handled without changing anything
 * for the shop that prints one line of text and a total.
 *
 * <p>Classify by what a document <i>contains</i>, never by what it is
 * <i>titled</i>: the title is evidence, not the decision. A sheet headed
 * "RECEIPT" that itemises three parts and their prices is a final bill; a sheet
 * headed "OFFICIAL RECEIPT" carrying nothing but amounts is not.
 */
public enum DocumentType {

    /**
     * The final bill: what was actually done and what was actually owed.
     *
     * <p>Covers the dealership's SERVICE INVOICE, the independent shop's
     * BILLING STATEMENT, and the untitled sheet from a talyer. The default when
     * nothing else is proven, because for most of the receipts this product
     * will ever see it is also the truth.
     */
    SERVICE_INVOICE(true, true),

    /**
     * Proof of payment, and nothing else.
     *
     * <p>Toyota's OFFICIAL RECEIPT prints VATable sales, VAT amount, total,
     * amount due and a PAID stamp — and not one word about what was done to the
     * car. It is authoritative for money and empty of work, which is exactly the
     * combination that must never be stored as a complete service record.
     *
     * <p>Earned only when the document has money and <b>no work lines at all</b>.
     * This is common in practice: owners keep the receipt and throw the invoice
     * away, so an upload holding only this is a case to serve properly, not to
     * reject.
     */
    OFFICIAL_RECEIPT(true, false),

    /**
     * Proposed work at proposed prices, before the job was done.
     *
     * <p>Repair orders, job orders, quotations, estimates. Its totals are a
     * forecast and are routinely wrong in both directions: on the Talisay visit
     * the estimate carried ₱700.00 of labour that ended up free under a
     * maintenance promo, and ₱440.63 of parts that actually billed at ₱248.36.
     *
     * <p>Earned only on explicit printed evidence — the words estimate,
     * quotation, repair order, job order, or a note that the figures are not
     * final. The work it lists is still worth keeping; its money is not.
     */
    ESTIMATE(false, true),

    /**
     * A record of work performed that carries no prices.
     *
     * <p>The job card, or the reverse of a repair order where a technician has
     * written what was actually done. Useful for the history, useless for the
     * cost.
     */
    WORK_PERFORMED(false, true),

    /**
     * An internal parts list with no prices — picking slip, delivery slip,
     * parts issue slip.
     *
     * <p>It names real parts that really went into the car, so it is not noise,
     * but it was never meant for the customer and it cannot price anything.
     */
    PARTS_SLIP(false, true),

    /**
     * Goods bought over the counter, with no labour on the page.
     *
     * <p>A parts shop hands over a cash sales invoice for one battery and
     * nothing else: an article, a price, a total, and no operation anywhere.
     * Nobody worked on the vehicle. If the owner fitted it at home there is no
     * shop labour, no warranty on the installation, and no record that it was
     * fitted at all - so filing it as a service invoice tells the next mechanic
     * a shop replaced the battery, which is false and stated confidently.
     *
     * <p><b>The discriminator is on the page, not in the title.</b> Every line
     * is a PART or a MATERIAL and there is no OPERATION. That is what separates
     * this from a small shop's sales order which bills parts and labour
     * together and is an ordinary final bill despite the similar heading.
     *
     * <p>Authoritative for cost - real money changed hands - and it does carry
     * content, because the goods are worth recording. "Motolite NF4L-B bought
     * on 1 October 2025, one week warranty" tells the next mechanic how old the
     * battery is, which is worth having from four handwritten words. What it
     * must not claim is that the part was fitted.
     */
    PARTS_PURCHASE(true, true),

    /**
     * A finding about the vehicle's condition, with no work and no prices.
     *
     * <p>Battery test printouts, emission test results, PMS inspection
     * checklists, diagnostic scan reports. A thermal slip reading
     * {@code BAD & REPLACE / 449CCA measured against 800CCA rated / STATE OF
     * HEALTH 56%} is not a record of anything done to the car - it is a
     * measurement of what the car is like, taken before anyone decided whether
     * to act.
     *
     * <p>Deliberately separate from {@link #WORK_PERFORMED}, which means work
     * was carried out. The distinction earns its place at the handoff: "battery
     * tested at 56% health, replacement recommended" is exactly what the next
     * mechanic wants to know, and filing it as work performed would claim the
     * battery was dealt with when it was only measured.
     *
     * <p>Common enough in Philippine shops to be worth its own type - almost
     * every battery sale starts with one of these slips.
     */
    INSPECTION_REPORT(false, false),

    /**
     * Not a service document at all.
     *
     * <p>Already a real case rather than a hypothetical: the golden set's
     * {@code gta-toledo-cooling} upload includes a screenshot of a
     * body-composition scale that the owner attached by mistake. Nothing from
     * such a page may reach any field.
     */
    NOT_A_RECEIPT(false, false);

    private final boolean costAuthoritative;
    private final boolean carriesWork;

    DocumentType(boolean costAuthoritative, boolean carriesWork) {
        this.costAuthoritative = costAuthoritative;
        this.carriesWork = carriesWork;
    }

    /**
     * Whether an amount printed here is what the owner actually owed.
     *
     * <p>False for {@link #ESTIMATE} above all: its total is the single most
     * dangerous number in the stack, because it is formatted exactly like a real
     * one.
     */
    public boolean isCostAuthoritative() {
        return costAuthoritative;
    }

    /** Whether this kind of document says anything about what was done. */
    public boolean carriesWork() {
        return carriesWork;
    }

    /**
     * A document that priced the visit but described none of it.
     *
     * <p>A record built from one of these is legitimate but incomplete, and has
     * to be marked as such: there is no work to show a mechanic and nothing for
     * the explanation feature to explain. It must never be filled in by
     * guessing.
     */
    public boolean isCostOnly() {
        return costAuthoritative && !carriesWork;
    }

    /**
     * The type to assume when the model returned nothing usable.
     *
     * <p>Voice drafts and older stored drafts have no document at all, and the
     * default has to be the harmless one: treating an unknown as an estimate
     * would silently strip the cost from every draft that predates this field.
     */
    public static DocumentType defaultType() {
        return SERVICE_INVOICE;
    }

    /** Parses a stored or model-supplied name, falling back to the default. */
    public static DocumentType fromNullable(String value) {
        if (value == null || value.isBlank()) {
            return defaultType();
        }
        try {
            return valueOf(value.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            return defaultType();
        }
    }
}
