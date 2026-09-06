package com.trevora.api.features.validation;

import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.vehicle.VehicleProfile;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

/**
 * Checks an extracted draft against what the system already knows, and says so
 * when the two disagree.
 *
 * <p>Everything else in validation asks whether a field is <i>present</i>. This
 * asks whether it is <i>possible</i>. The difference matters because the
 * failures that survive OCR are rarely blank — they are plausible-looking
 * numbers in the right shape. A misread that turns 45,000 km into 450,000 fills
 * the field, passes every required-field rule, and is wrong by a factor of ten.
 *
 * <p>Three questions, each answerable from data already in the database:
 *
 * <ul>
 *   <li><b>Could this date be right?</b> A service cannot have happened
 *       tomorrow.
 *   <li><b>Could this odometer be right?</b> Odometers only increase. One
 *       below the last reading is a misread, a wrong vehicle, or a receipt
 *       filed out of order.
 *   <li><b>Has this receipt already been filed?</b> Nothing compared a new
 *       draft against existing records, so the same receipt uploaded twice
 *       produced two records, inflating both the spend total and the history
 *       completeness strip — the two numbers the vehicle page uses to argue
 *       the history is trustworthy.
 * </ul>
 *
 * <p><b>Everything here warns; nothing blocks.</b> Each check can be wrong in a
 * legitimate case: a cluster instrument gets replaced and the odometer really
 * does drop, a shop really does issue two near-identical invoices on one day.
 * The owner is the one who knows which, so the job is to put the discrepancy in
 * front of them, not to refuse the record. The one exception is a future date,
 * which nothing legitimate produces.
 */
@Service
public class DraftPlausibilityService {

    /**
     * A day of slack on future dates: the server and the receipt printer can
     * sit either side of midnight, and a same-day upload from a shop whose
     * clock runs fast should not be an error.
     */
    private static final long FUTURE_DATE_GRACE_DAYS = 1;

    /** Before this, a service record is almost certainly a misread year. */
    private static final int EARLIEST_PLAUSIBLE_YEAR = 1950;

    /**
     * Odometer jump, in kilometres, beyond which a reading is worth questioning
     * even though it increased. Roughly four years of hard PH driving; high on
     * purpose, because this fires on a value the owner may well have to defend
     * to a buyer and crying wolf costs more than the rare missed digit.
     */
    private static final int IMPLAUSIBLE_ODOMETER_JUMP_KM = 120_000;

    /** Two records this close in cost are probably one receipt filed twice. */
    private static final BigDecimal DUPLICATE_COST_TOLERANCE = new BigDecimal("0.50");

    /**
     * How far apart two dates can be and still be one receipt.
     *
     * <p>This used to demand the same day, which anchored the whole check to
     * the two fields extraction is worst at. Against the golden set serviceDate
     * scores about 80% and shopName about 40%, while totalCost is around 90% —
     * so the same receipt scanned twice routinely produced two different dates
     * and two different shop names, and the check that was supposed to catch it
     * saw two unrelated services.
     *
     * <p>An exact cost match is the strong signal. Money to the centavo does
     * not repeat by accident, so the window only has to be wide enough to
     * absorb a misread date and narrow enough to stay inside a real service
     * interval. A misread can move a date by most of a month — one report had
     * the same receipt read as the 11th and then the 30th — while genuine
     * visits to one vehicle are months apart, at 5,000 km or twice a year.
     * A month sits comfortably between the two.
     */
    private static final int DUPLICATE_DATE_WINDOW_DAYS = 31;

    private final ServiceRecordRepository serviceRecordRepository;
    private final ServiceDraftRepository serviceDraftRepository;

    public DraftPlausibilityService(
            ServiceRecordRepository serviceRecordRepository,
            ServiceDraftRepository serviceDraftRepository) {
        this.serviceRecordRepository = serviceRecordRepository;
        this.serviceDraftRepository = serviceDraftRepository;
    }

    public List<FieldValidationIssue> check(ServiceDraft draft, VehicleProfile vehicle) {
        List<FieldValidationIssue> issues = new ArrayList<>();
        List<ServiceRecord> history = historyFor(draft);

        issues.addAll(checkDate(draft));
        issues.addAll(checkOdometer(draft, vehicle, history));
        issues.addAll(checkDuplicate(draft, history));
        // Only when the confirmed history had nothing to say: one duplicate
        // notice is a warning, two is noise about the same receipt.
        if (issues.stream().noneMatch(issue -> "POSSIBLE_DUPLICATE".equals(issue.category()))) {
            issues.addAll(checkDuplicateDraft(draft));
        }
        return issues;
    }

    private List<ServiceRecord> historyFor(ServiceDraft draft) {
        if (draft.getVehicleId() == null || draft.getOwnerId() == null) {
            return List.of();
        }
        return serviceRecordRepository.findByVehicleIdAndOwnerId(
                draft.getVehicleId(),
                draft.getOwnerId(),
                Sort.by(Sort.Direction.DESC, "serviceDate")
        );
    }

    // ---- date ------------------------------------------------------------

    private List<FieldValidationIssue> checkDate(ServiceDraft draft) {
        LocalDate serviceDate = draft.getServiceDate();
        if (serviceDate == null) {
            return List.of();
        }

        LocalDate latestAcceptable = LocalDate.now().plusDays(FUTURE_DATE_GRACE_DAYS);
        if (serviceDate.isAfter(latestAcceptable)) {
            return List.of(issue(
                    "serviceDate",
                    "Service date",
                    "IMPLAUSIBLE_VALUE",
                    "ERROR",
                    "This service date is in the future (" + serviceDate + "). Receipts are printed "
                            + "after the work, so this is a misread date — check the receipt and correct it.",
                    serviceDate,
                    draft,
                    true
            ));
        }

        if (serviceDate.getYear() < EARLIEST_PLAUSIBLE_YEAR) {
            return List.of(issue(
                    "serviceDate",
                    "Service date",
                    "IMPLAUSIBLE_VALUE",
                    "WARNING",
                    "This service date reads " + serviceDate + ", which is almost certainly a misread "
                            + "year. Check the receipt.",
                    serviceDate,
                    draft,
                    false
            ));
        }

        return List.of();
    }

    // ---- odometer --------------------------------------------------------

    private List<FieldValidationIssue> checkOdometer(
            ServiceDraft draft,
            VehicleProfile vehicle,
            List<ServiceRecord> history
    ) {
        Integer odometer = draft.getOdometer();
        if (odometer == null) {
            return List.of();
        }

        // The highest reading anyone has recorded for this vehicle, from either
        // the profile or the history. Records are not always filed in order, so
        // the newest record is not reliably the highest.
        Integer highest = highestKnownOdometer(vehicle, history, draft);
        if (highest == null) {
            return List.of();
        }

        if (odometer < highest) {
            return List.of(issue(
                    "odometer",
                    "Odometer",
                    "IMPLAUSIBLE_VALUE",
                    "WARNING",
                    "This reads " + format(odometer) + " km, which is below the "
                            + format(highest) + " km already recorded for this vehicle. Odometers only "
                            + "go up, so this is usually a misread digit, a receipt for a different "
                            + "vehicle, or an older service being added now.",
                    odometer,
                    draft,
                    false
            ));
        }

        if (odometer - highest > IMPLAUSIBLE_ODOMETER_JUMP_KM) {
            return List.of(issue(
                    "odometer",
                    "Odometer",
                    "IMPLAUSIBLE_VALUE",
                    "WARNING",
                    "This reads " + format(odometer) + " km, a jump of "
                            + format(odometer - highest) + " km since the last record. Check for an "
                            + "extra digit before confirming.",
                    odometer,
                    draft,
                    false
            ));
        }

        return List.of();
    }

    private Integer highestKnownOdometer(VehicleProfile vehicle, List<ServiceRecord> history, ServiceDraft draft) {
        Integer highest = vehicle == null ? null : vehicle.getOdometer();
        for (ServiceRecord record : history) {
            // A draft being re-validated after confirmation must not be compared
            // against the record it produced.
            if (record.getOdometer() == null || isSameDraft(record, draft)) {
                continue;
            }
            if (highest == null || record.getOdometer() > highest) {
                highest = record.getOdometer();
            }
        }
        return highest;
    }

    // ---- duplicates ------------------------------------------------------

    /**
     * The same receipt scanned twice before either was confirmed.
     *
     * <p>The check above compares against confirmed records, which is the
     * right place for a duplicate that got through. It cannot see the more
     * common slip: photographing a receipt, being unsure it worked, and
     * photographing it again. That leaves two drafts and no records, so there
     * was nothing to match against and nothing was said.
     */
    private List<FieldValidationIssue> checkDuplicateDraft(ServiceDraft draft) {
        if (draft.getVehicleId() == null || draft.getOwnerId() == null || !hasSomethingToMatchOn(draft)) {
            return List.of();
        }

        ServiceDraft match = serviceDraftRepository
                .findByVehicleIdAndOwnerId(draft.getVehicleId(), draft.getOwnerId())
                .stream()
                .filter(other -> other.getDraftId() != null && !other.getDraftId().equals(draft.getDraftId()))
                /*
                 * Unconfirmed drafts only.
                 *
                 * <p>A confirmed draft is not a draft any more -- it is a
                 * service record, and the check above already compares against
                 * those. Without this filter the same receipt was reported
                 * twice over, and worse: confirming a draft leaves its row
                 * behind, so deleting the record it produced left a CONFIRMED
                 * draft nothing points at. Scanning that receipt again matched
                 * the orphan and announced "you have another draft ... it has
                 * not been confirmed yet" about a draft that had been confirmed
                 * and whose record the owner had just deleted.
                 */
                .filter(other -> other.getStatus() != DraftStatus.CONFIRMED)
                .filter(other -> looksLikeOneReceipt(
                        draft, other.getServiceDate(), other.getOdometer(), other.getTotalCost()))
                .filter(other -> shopDoesNotContradict(draft.getShopName(), other.getShopName()))
                .findFirst()
                .orElse(null);

        if (match == null) {
            return List.of();
        }

        return List.of(issue(
                "duplicate",
                "Possible duplicate",
                "POSSIBLE_DUPLICATE",
                "WARNING",
                "You have another draft " + agreementWith(draft, match.getTotalCost(), match.getOdometer())
                        + dateClause(match.getServiceDate())
                        + ". It has not been confirmed yet. If this is the same receipt scanned "
                        + "twice, throw one away rather than confirming both.",
                draft.getTotalCost(),
                draft,
                false,
                "issue.duplicateDraft",
                Map.of("agreement", agreementKeyWith(draft, match.getTotalCost(), match.getOdometer()),
                        "date", String.valueOf(match.getServiceDate()))
        ));
    }

    private List<FieldValidationIssue> checkDuplicate(ServiceDraft draft, List<ServiceRecord> history) {
        if (!hasSomethingToMatchOn(draft)) {
            return List.of();
        }

        ServiceRecord match = history.stream()
                .filter(record -> !isSameDraft(record, draft))
                .filter(record -> looksLikeOneReceipt(
                        draft, record.getServiceDate(), record.getOdometer(), record.getTotalCost()))
                .filter(record -> shopDoesNotContradict(draft.getShopName(), record.getShopName()))
                .min(Comparator.comparing(ServiceRecord::getServiceDate))
                .orElse(null);

        if (match == null) {
            return List.of();
        }

        return List.of(issue(
                // Not "totalCost": the review UI keys issues by field name and
                // keeps the last one written, so filing this under a real field
                // would silently replace that field's confidence flag. A
                // duplicate is a property of the record, not of one value.
                "duplicate",
                "Possible duplicate",
                "POSSIBLE_DUPLICATE",
                "WARNING",
                "This vehicle already has a record " + agreementWith(draft, match.getTotalCost(), match.getOdometer())
                        + dateClause(match.getServiceDate())
                        + ". If it is the same receipt, delete this draft rather than confirming it "
                        + "— a second copy would inflate the spend total and the years covered.",
                draft.getTotalCost(),
                draft,
                false,
                "issue.duplicateRecord",
                Map.of("agreement", agreementKeyWith(draft, match.getTotalCost(), match.getOdometer()),
                        "date", String.valueOf(match.getServiceDate()))
        ));
    }

    /**
     * Is there anything solid enough here to compare against?
     *
     * <p>A total or an odometer reading. The check used to demand a total and
     * give up without one — which is exactly when it was needed most, because
     * a receipt whose total did not extract is a receipt somebody is likely to
     * photograph a second time. A date and a shop name alone are too weak: one
     * shop can bill a vehicle twice in a day.
     */
    private boolean hasSomethingToMatchOn(ServiceDraft draft) {
        return draft.getTotalCost() != null
                || (draft.getOdometer() != null && draft.getOdometer() > 0);
    }

    /**
     * Enough agreement between two entries to be worth asking about.
     *
     * <p>Two signals are strong enough to raise this on their own, and at
     * least one has to be present. An exact total, because money to the
     * centavo does not repeat by accident. And an identical odometer, because
     * a vehicle genuinely serviced twice was driven in between — that is what
     * the second visit is for — which also makes it the one signal a misread
     * date cannot spoil, so it needs no date agreement at all.
     *
     * <p>Matching on the total still asks the dates to be close, since the
     * same round figure can recur across a year of routine servicing.
     */
    private boolean looksLikeOneReceipt(
            ServiceDraft draft, LocalDate otherDate, Integer otherOdometer, BigDecimal otherTotal) {
        /* Two totals that both read cleanly and disagree settle it, and settle
           it against a match. One visit can produce a parts slip and a labour
           invoice on the same afternoon at the same odometer: same visit, two
           documents, two records -- not two copies of one. Without this the
           odometer alone would accuse them of duplicating each other. */
        if (draft.getTotalCost() != null && otherTotal != null
                && !sameMoney(draft.getTotalCost(), otherTotal)) {
            return false;
        }
        if (sameOdometer(draft.getOdometer(), otherOdometer)) {
            return true;
        }
        return sameMoney(draft.getTotalCost(), otherTotal)
                && nearlySameDate(draft.getServiceDate(), otherDate);
    }

    /** A reading of zero is a placeholder, not a measurement. */
    private boolean sameOdometer(Integer first, Integer second) {
        return first != null && second != null && first > 0 && first.equals(second);
    }

    /** Names whichever signal actually matched, rather than assuming the total. */
    private String agreementWith(ServiceDraft draft, BigDecimal otherTotal, Integer otherOdometer) {
        if (sameMoney(draft.getTotalCost(), otherTotal)) {
            return "for the same total";
        }
        if (sameOdometer(draft.getOdometer(), otherOdometer)) {
            return "at the same odometer reading";
        }
        return "that looks the same";
    }

    /* No trailing punctuation of its own: it carried a comma, which ran
       straight into the full stop that follows it and printed "dated
       2026-03-18,. If it is". Each caller punctuates its own sentence. */
    private String dateClause(LocalDate date) {
        return date == null ? "" : ", dated " + date;
    }


    /** Which signal matched, as a key the reader's own language can phrase. */
    private String agreementKeyWith(ServiceDraft draft, BigDecimal otherTotal, Integer otherOdometer) {
        if (sameMoney(draft.getTotalCost(), otherTotal)) {
            return "issue.agreement.total";
        }
        if (sameOdometer(draft.getOdometer(), otherOdometer)) {
            return "issue.agreement.odometer";
        }
        return "issue.agreement.similar";
    }

    /** Within a month either way. See DUPLICATE_DATE_WINDOW_DAYS. */
    private boolean nearlySameDate(LocalDate first, LocalDate second) {
        if (first == null || second == null) {
            return false;
        }
        return Math.abs(ChronoUnit.DAYS.between(first, second)) <= DUPLICATE_DATE_WINDOW_DAYS;
    }

    /**
     * Absence of a shop name is not disagreement.
     *
     * <p>The old rule required both to read the same, so one failed shop-name
     * extraction — four times in ten — hid the duplicate. A blank on either
     * side now says nothing either way, and only two names that genuinely
     * differ rule a match out.
     */
    private boolean shopDoesNotContradict(String first, String second) {
        String a = normalizeShop(first);
        String b = normalizeShop(second);
        if (a.isEmpty() || b.isEmpty()) {
            return true;
        }
        return a.equals(b) || a.startsWith(b) || b.startsWith(a);
    }

    private boolean sameMoney(BigDecimal first, BigDecimal second) {
        if (first == null || second == null) {
            return false;
        }
        return first.subtract(second).abs().compareTo(DUPLICATE_COST_TOLERANCE) <= 0;
    }

    private String normalizeShop(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    // ---- shared ----------------------------------------------------------

    private boolean isSameDraft(ServiceRecord record, ServiceDraft draft) {
        UUID draftId = draft.getDraftId();
        return draftId != null && draftId.equals(record.getDraftId());
    }

    private String format(int kilometres) {
        return String.format(Locale.ROOT, "%,d", kilometres);
    }

    private FieldValidationIssue issue(
            String fieldName,
            String label,
            String category,
            String severity,
            String message,
            Object currentValue,
            ServiceDraft draft,
            boolean blocksConfirmation
    ) {
        return issue(fieldName, label, category, severity, message, currentValue, draft,
                blocksConfirmation, null, null);
    }

    /** The same, with the message also addressable by key. See FieldValidationIssue. */
    private FieldValidationIssue issue(
            String fieldName,
            String label,
            String category,
            String severity,
            String message,
            Object currentValue,
            ServiceDraft draft,
            boolean blocksConfirmation,
            String messageKey,
            Map<String, Object> messageArgs
    ) {
        return new FieldValidationIssue(
                fieldName,
                label,
                category,
                severity,
                message,
                currentValue,
                draft.getInputMethod() == null ? null : draft.getInputMethod().name(),
                blocksConfirmation,
                true,
                messageKey,
                messageArgs
        );
    }
}
