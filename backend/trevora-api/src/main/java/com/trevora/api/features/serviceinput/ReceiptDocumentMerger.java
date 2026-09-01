package com.trevora.api.features.serviceinput;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Folds several documents from one visit into one draft.
 *
 * <p><b>Why this exists.</b> An upload of several images was concatenated into
 * a single block of OCR text and extracted once. That is right when the images
 * are pages of one receipt and wrong the moment they are not. A single Toyota
 * Talisay visit produces five different documents, and photographing the stack
 * put {@code GRAND TOTAL 5,534.01} from the repair order and
 * {@code TOTAL PRICE 3,106.49} from the service invoice into the same text with
 * nothing to say which was which. The model then picked one. Classifying each
 * document and then deciding, per field, which document is entitled to answer,
 * is the difference between a record that is right about one photograph and one
 * that is right about a stack.
 *
 * <p><b>Precedence is per field, not per document.</b> No single sheet wins
 * everything, and assuming one does is how the money and the work end up coming
 * from different visits:
 *
 * <ul>
 *   <li><b>Cost</b> comes from the invoice, or the official receipt if there is
 *       no invoice, and <b>never</b> from an estimate. The estimate's total is
 *       printed in the same font and the same box as a real one - on the Talisay
 *       visit it was 78% too high - so nothing downstream can catch it.
 *   <li><b>Work</b> comes from the document that describes it best: the invoice
 *       first, then a job card, then the estimate, then a parts slip. An
 *       official receipt describes none, however authoritative it is about money.
 *   <li><b>Identity</b> - date, shop, location - follows the same ranking, since
 *       the document entitled to price the visit is also the one most likely to
 *       date it correctly. The repair order dates the drop-off, not the service.
 *   <li><b>Odometer</b> is taken from wherever it is printed, preferring
 *       documents that agree. It is a fact about the car rather than a claim by
 *       the shop, so a picking slip is as good a source as an invoice.
 * </ul>
 *
 * <p><b>Pages of one document are joined; different documents are not.</b>
 * Concatenating line entries across documents would double the money, because
 * an invoice and its repair order list the same work twice. Pages sharing a
 * printed document number are one document and their lines are joined; anything
 * else is a separate document and only the winner's lines are kept. The losing
 * documents are not silently dropped - every one of them is named in a warning,
 * because an owner who photographed a repair order and an invoice should be
 * told which one the record came from.
 */
final class ReceiptDocumentMerger {

    /**
     * How much a document is entitled to say, highest first.
     *
     * <p>Ordering, not scoring. The only judgements encoded are that a final
     * bill beats a receipt, a receipt beats a quote, and a document nobody meant
     * for the customer comes last.
     */
    private static final List<DocumentType> COST_RANK = List.of(
            DocumentType.SERVICE_INVOICE,
            DocumentType.OFFICIAL_RECEIPT,
            DocumentType.PARTS_PURCHASE);

    private static final List<DocumentType> WORK_RANK = List.of(
            DocumentType.SERVICE_INVOICE,
            DocumentType.WORK_PERFORMED,
            // Above the estimate: goods actually bought outrank work merely
            // proposed.
            DocumentType.PARTS_PURCHASE,
            DocumentType.ESTIMATE,
            DocumentType.PARTS_SLIP,
            DocumentType.INSPECTION_REPORT);

    private ReceiptDocumentMerger() {
    }

    /**
     * @param pages one extraction per uploaded image, in upload order
     * @return a single draft, or the only page when there is just one
     */
    static ReceiptDraftFields merge(List<ReceiptDraftFields> pages) {
        List<ReceiptDraftFields> usable = pages == null
                ? List.of()
                : pages.stream().filter(page -> page != null).toList();
        if (usable.isEmpty()) {
            return null;
        }
        if (usable.size() == 1) {
            return usable.get(0);
        }

        List<ReceiptDraftFields> documents = joinPagesOfSameDocument(usable);
        List<String> warnings = new ArrayList<>();

        ReceiptDraftFields costSource = highestRanked(documents, COST_RANK, page -> page.totalCost() != null);
        if (costSource == null) {
            // Nothing entitled to price the visit was photographed. Falling back
            // to whatever printed a total keeps an estimate-only upload holding
            // its quote, which is what the same upload of a single image does -
            // and dropping the figure because no invoice was present would make
            // the number of photographs decide whether a cost survives. The
            // document type still says it is a quote, and the warning below
            // still says so out loud.
            costSource = highestRanked(documents, WORK_RANK, page -> page.totalCost() != null);
        }
        ReceiptDraftFields workSource = highestRanked(documents, WORK_RANK, page -> hasWork(page));
        ReceiptDraftFields identitySource = firstNonNull(costSource, workSource, documents.get(0));

        describeMerge(documents, costSource, workSource, warnings);
        // Before the draft is built, so a disagreement between the documents is
        // reported rather than resolved silently.
        Integer odometer = agreedOdometer(documents, warnings);

        for (ReceiptDraftFields document : documents) {
            warnings.addAll(document.warnings() == null ? List.of() : document.warnings());
        }

        return new ReceiptDraftFields(
                identitySource.documentType(),
                identitySource.documentNumber(),
                allReferenceNumbers(documents),
                identitySource.serviceDate(),
                workSource == null ? List.of() : workSource.services(),
                odometer,
                costSource == null ? null : costSource.totalCost(),
                firstNonBlank(documents, ReceiptDraftFields::shopName),
                firstNonBlank(documents, ReceiptDraftFields::location),
                firstNonBlank(documents, ReceiptDraftFields::remarks),
                distinct(documents, ReceiptDraftFields::confidenceNotes),
                identitySource.fieldSources(),
                identitySource.fieldConfidence(),
                distinct(documents, ReceiptDraftFields::aiSuggestedFields),
                workSource == null ? identitySource.classification() : workSource.classification(),
                warnings
        );
    }

    /**
     * Pages carrying the same printed document number are one document.
     *
     * <p>A three-page invoice is not three invoices, and its lines belong
     * together. Pages with no document number cannot be shown to belong to
     * anything, so each stands alone - joining them on a guess would merge two
     * unrelated receipts, which is the failure this class exists to prevent.
     */
    private static List<ReceiptDraftFields> joinPagesOfSameDocument(List<ReceiptDraftFields> pages) {
        Map<String, List<ReceiptDraftFields>> byDocument = new LinkedHashMap<>();
        List<ReceiptDraftFields> standalone = new ArrayList<>();

        for (ReceiptDraftFields page : pages) {
            String number = page.documentNumber();
            if (number == null || number.isBlank()) {
                standalone.add(page);
                continue;
            }
            byDocument.computeIfAbsent(page.documentType() + "/" + number.trim(), key -> new ArrayList<>())
                    .add(page);
        }

        List<ReceiptDraftFields> documents = new ArrayList<>();
        byDocument.values().forEach(group -> documents.add(group.size() == 1 ? group.get(0) : joinPages(group)));
        documents.addAll(standalone);
        return documents;
    }

    /** One document spread over several photographs: keep every line, take the rest from the first page carrying it. */
    private static ReceiptDraftFields joinPages(List<ReceiptDraftFields> group) {
        List<ServiceItemFields> services = new ArrayList<>();
        group.forEach(page -> services.addAll(page.services() == null ? List.of() : page.services()));

        ReceiptDraftFields first = group.get(0);
        return new ReceiptDraftFields(
                first.documentType(),
                first.documentNumber(),
                distinct(group, ReceiptDraftFields::referenceNumbers),
                firstNonNull(group, ReceiptDraftFields::serviceDate),
                services,
                firstNonNull(group, ReceiptDraftFields::odometer),
                firstNonNull(group, ReceiptDraftFields::totalCost),
                firstNonBlank(group, ReceiptDraftFields::shopName),
                firstNonBlank(group, ReceiptDraftFields::location),
                firstNonBlank(group, ReceiptDraftFields::remarks),
                distinct(group, ReceiptDraftFields::confidenceNotes),
                first.fieldSources(),
                first.fieldConfidence(),
                distinct(group, ReceiptDraftFields::aiSuggestedFields),
                first.classification(),
                distinct(group, ReceiptDraftFields::warnings)
        );
    }

    /**
     * Says what was merged and what was set aside.
     *
     * <p>Silence here would be the worst outcome. An owner who photographed a
     * repair order and an invoice has two totals in their hand and needs to know
     * which one the record took, and a reviewer looking at a cost that came off
     * a different sheet from the work has no other way to find that out.
     */
    private static void describeMerge(
            List<ReceiptDraftFields> documents,
            ReceiptDraftFields costSource,
            ReceiptDraftFields workSource,
            List<String> warnings
    ) {
        if (documents.size() < 2) {
            return;
        }
        warnings.add("This upload holds " + documents.size() + " separate documents: "
                + describeTypes(documents) + ".");

        if (costSource != null) {
            warnings.add("The cost was taken from the " + readable(costSource.documentType())
                    + describeNumber(costSource) + ".");
        }
        if (workSource != null && workSource != costSource) {
            warnings.add("The work was taken from the " + readable(workSource.documentType())
                    + describeNumber(workSource) + ".");
        }

        documents.stream()
                .filter(document -> document.documentType() == DocumentType.ESTIMATE)
                .filter(document -> document.totalCost() != null)
                .filter(document -> document != costSource)
                .forEach(estimate -> warnings.add(
                        "An estimate in this upload quoted " + estimate.totalCost().toPlainString()
                                + ", which was not used as the cost: it is a quote, not what was paid."));
    }

    private static String describeTypes(List<ReceiptDraftFields> documents) {
        List<String> names = new ArrayList<>();
        documents.forEach(document -> names.add(readable(document.documentType())));
        return String.join(", ", names);
    }

    private static String describeNumber(ReceiptDraftFields document) {
        String number = document.documentNumber();
        return number == null || number.isBlank() ? "" : " (" + number.trim() + ")";
    }

    private static String readable(DocumentType type) {
        if (type == null) {
            return "document";
        }
        return switch (type) {
            case SERVICE_INVOICE -> "service invoice";
            case OFFICIAL_RECEIPT -> "official receipt";
            case ESTIMATE -> "estimate or repair order";
            case WORK_PERFORMED -> "job card";
            case PARTS_PURCHASE -> "parts purchase";
            case PARTS_SLIP -> "parts slip";
            case INSPECTION_REPORT -> "inspection report";
            case NOT_A_RECEIPT -> "page that is not a service document";
        };
    }

    /**
     * The odometer the documents agree on.
     *
     * <p>A reading printed on more than one sheet of the same visit is worth
     * more than one printed once, because the commonest odometer error is not a
     * misread digit but the wrong number entirely - a repair order carries the
     * mileage, the warranty expiry kilometres and the next service interval, all
     * looking equally like an odometer. Agreement across documents is the
     * cheapest evidence available that the right one was picked.
     */
    private static Integer agreedOdometer(List<ReceiptDraftFields> documents, List<String> warnings) {
        Map<Integer, Integer> counts = new LinkedHashMap<>();
        documents.stream()
                .map(ReceiptDraftFields::odometer)
                .filter(value -> value != null)
                .forEach(value -> counts.merge(value, 1, Integer::sum));

        if (counts.isEmpty()) {
            return null;
        }
        if (counts.size() > 1) {
            warnings.add("The documents in this upload disagree about the odometer: "
                    + describeReadings(counts) + ". Check it against the vehicle.");
        }

        int mostSeen = counts.values().stream().mapToInt(Integer::intValue).max().orElse(0);
        List<Integer> tied = counts.entrySet().stream()
                .filter(entry -> entry.getValue() == mostSeen)
                .map(Map.Entry::getKey)
                .toList();
        if (tied.size() == 1) {
            return tied.get(0);
        }

        // No reading appears more often than any other, so there is no agreement
        // to go on and something has to break the tie. The document ranking is
        // the only non-arbitrary answer available, and it is what every other
        // field here already uses.
        //
        // What this must NOT be is a rule reverse-engineered from one receipt.
        // Preferring the larger reading would fix the Talisay visit, where a
        // repair order offered 3 against a picking slip's 242, and would then
        // choose the warranty expiry figure of 100,000 over a real 242 on the
        // very next document. The honest fix for that visit is upstream: the
        // repair order prints MILEAGE 3 KM and Kilometers KM 242 and the
        // extraction reads the wrong label. A merge heuristic tuned to hide that
        // would leave it unfixed in the single-document case as well.
        for (DocumentType type : WORK_RANK) {
            for (ReceiptDraftFields document : documents) {
                if (document.documentType() == type
                        && document.odometer() != null
                        && tied.contains(document.odometer())) {
                    return document.odometer();
                }
            }
        }
        return tied.get(0);
    }

    private static String describeReadings(Map<Integer, Integer> counts) {
        List<String> readings = new ArrayList<>();
        counts.forEach((value, seen) -> readings.add(
                value + (seen > 1 ? " (on " + seen + " documents)" : "")));
        return String.join(" and ", readings);
    }

    private static boolean hasWork(ReceiptDraftFields page) {
        return page.services() != null && !page.services().isEmpty();
    }

    private static ReceiptDraftFields highestRanked(
            List<ReceiptDraftFields> documents,
            List<DocumentType> rank,
            java.util.function.Predicate<ReceiptDraftFields> usable
    ) {
        for (DocumentType type : rank) {
            for (ReceiptDraftFields document : documents) {
                if (document.documentType() == type && usable.test(document)) {
                    return document;
                }
            }
        }
        return null;
    }

    private static List<String> allReferenceNumbers(List<ReceiptDraftFields> documents) {
        Set<String> numbers = new LinkedHashSet<>();
        documents.forEach(document -> {
            if (document.referenceNumbers() != null) {
                numbers.addAll(document.referenceNumbers());
            }
            // A sibling document's own number is a reference as far as the
            // merged draft is concerned: it is how this visit's paperwork is
            // found again.
            if (document.documentNumber() != null && !document.documentNumber().isBlank()) {
                numbers.add(document.documentNumber().trim());
            }
        });
        return List.copyOf(numbers);
    }

    private static <T> T firstNonNull(
            List<ReceiptDraftFields> documents,
            java.util.function.Function<ReceiptDraftFields, T> reader
    ) {
        return documents.stream().map(reader).filter(value -> value != null).findFirst().orElse(null);
    }

    @SafeVarargs
    private static ReceiptDraftFields firstNonNull(ReceiptDraftFields... candidates) {
        for (ReceiptDraftFields candidate : candidates) {
            if (candidate != null) {
                return candidate;
            }
        }
        return null;
    }

    private static String firstNonBlank(
            List<ReceiptDraftFields> documents,
            java.util.function.Function<ReceiptDraftFields, String> reader
    ) {
        return documents.stream()
                .map(reader)
                .filter(value -> value != null && !value.isBlank())
                .findFirst()
                .orElse(null);
    }

    private static List<String> distinct(
            List<ReceiptDraftFields> documents,
            java.util.function.Function<ReceiptDraftFields, List<String>> reader
    ) {
        Set<String> values = new LinkedHashSet<>();
        documents.forEach(document -> {
            List<String> read = reader.apply(document);
            if (read != null) {
                values.addAll(read);
            }
        });
        return List.copyOf(values);
    }
}
