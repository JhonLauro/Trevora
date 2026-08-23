package com.trevora.api.features.validation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.trevora.api.features.serviceinput.InputMethod;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.vehicle.VehicleProfile;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * The three questions that need the database to answer: could this date be
 * right, could this odometer be right, and has this receipt already been filed.
 *
 * <p>Each has a legitimate case that must not be flagged, and those are tested
 * as carefully as the failures. A check that cries wolf on ordinary records is
 * worse than no check, because it teaches the owner to confirm past warnings.
 */
class DraftPlausibilityServiceTest {

    private static final UUID VEHICLE = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();

    private ServiceRecordRepository records;
    private DraftPlausibilityService service;

    @BeforeEach
    void setUp() {
        records = mock(ServiceRecordRepository.class);
        service = new DraftPlausibilityService(records);
        history();
    }

    // ---- dates -----------------------------------------------------------

    @Test
    void aFutureServiceDateBlocksConfirmation() {
        List<FieldValidationIssue> issues = service.check(draft(LocalDate.now().plusDays(30), null, null), vehicle(null));

        assertThat(issues).singleElement().satisfies(issue -> {
            assertThat(issue.fieldName()).isEqualTo("serviceDate");
            assertThat(issue.severity()).isEqualTo("ERROR");
            assertThat(issue.blocksConfirmation()).isTrue();
        });
    }

    @Test
    void todayIsFine() {
        // The overwhelmingly common case: photograph the receipt on the way out
        // of the shop.
        assertThat(service.check(draft(LocalDate.now(), null, null), vehicle(null))).isEmpty();
    }

    @Test
    void tomorrowIsToleratedBecauseClocksDisagree() {
        // A shop printer running fast, or a server on the other side of
        // midnight, must not produce an error on a same-day upload.
        assertThat(service.check(draft(LocalDate.now().plusDays(1), null, null), vehicle(null))).isEmpty();
    }

    @Test
    void aMisreadYearWarnsWithoutBlocking() {
        List<FieldValidationIssue> issues = service.check(draft(LocalDate.of(1920, 5, 4), null, null), vehicle(null));

        assertThat(issues).singleElement().satisfies(issue -> {
            assertThat(issue.severity()).isEqualTo("WARNING");
            assertThat(issue.blocksConfirmation()).isFalse();
        });
    }

    @Test
    void anOldButRealServiceDateIsNotFlagged() {
        // The GTA receipt in the golden set is from 2020. Filing old receipts is
        // the behaviour the whole product is trying to encourage.
        assertThat(service.check(draft(LocalDate.of(2020, 9, 22), null, null), vehicle(null))).isEmpty();
    }

    // ---- odometer --------------------------------------------------------

    @Test
    void anOdometerBelowTheLastReadingIsFlagged() {
        List<FieldValidationIssue> issues = service.check(draft(LocalDate.now(), 44000, null), vehicle(45000));

        assertThat(issues).singleElement().satisfies(issue -> {
            assertThat(issue.fieldName()).isEqualTo("odometer");
            assertThat(issue.message()).contains("45,000 km already recorded");
            // Cluster replacements happen. The owner decides, not the system.
            assertThat(issue.blocksConfirmation()).isFalse();
        });
    }

    @Test
    void theHighestReadingWinsNotTheMostRecentlyFiled() {
        // Records are not always added in order. Comparing against whichever
        // was filed last would let a backdated record lower the bar.
        history(record(LocalDate.now().minusYears(2), 80000, "900.00", "Shop"),
                record(LocalDate.now().minusMonths(1), 20000, "900.00", "Shop"));

        assertThat(service.check(draft(LocalDate.now(), 50000, null), vehicle(null)))
                .singleElement()
                .satisfies(issue -> assertThat(issue.message()).contains("80,000 km"));
    }

    @Test
    void anImplausibleJumpUpwardIsAlsoFlagged() {
        // 45,000 to 450,000 is the transposed-digit failure: it increases, so a
        // monotonic check alone would pass it.
        assertThat(service.check(draft(LocalDate.now(), 450000, null), vehicle(45000)))
                .singleElement()
                .satisfies(issue -> assertThat(issue.message()).contains("jump of"));
    }

    @Test
    void ordinaryDrivingBetweenServicesIsNotFlagged() {
        assertThat(service.check(draft(LocalDate.now(), 52000, null), vehicle(45000))).isEmpty();
    }

    @Test
    void aFirstRecordHasNothingToCompareAgainst() {
        assertThat(service.check(draft(LocalDate.now(), 45000, null), vehicle(null))).isEmpty();
    }

    // ---- duplicates ------------------------------------------------------

    @Test
    void theSameReceiptFiledTwiceIsFlagged() {
        history(record(LocalDate.of(2026, 3, 14), null, "2450.00", "RJ Motor Parts & Service"));

        assertThat(service.check(draft(LocalDate.of(2026, 3, 14), null, "2450.00", "RJ MOTOR PARTS & SERVICE"), vehicle(null)))
                .singleElement()
                .satisfies(issue -> {
                    assertThat(issue.category()).isEqualTo("POSSIBLE_DUPLICATE");
                    // Its own field name, so it cannot displace a real field's
                    // issue in the review screen's by-field map.
                    assertThat(issue.fieldName()).isEqualTo("duplicate");
                    // Never blocks: a shop can legitimately issue two identical
                    // invoices in one day.
                    assertThat(issue.blocksConfirmation()).isFalse();
                });
    }

    @Test
    void shopNameMatchingIgnoresCaseAndPunctuation() {
        // OCR renders the same shop differently between runs, so an exact
        // comparison would miss most real duplicates.
        history(record(LocalDate.of(2020, 9, 22), null, "3325.00", "GTA Auto Services"));

        assertThat(service.check(draft(LocalDate.of(2020, 9, 22), null, "3325.00", "gta auto services!"), vehicle(null)))
                .hasSize(1);
    }

    @Test
    void adifferentAmountOnTheSameDayIsNotADuplicate() {
        // Two genuine visits in one day: fuel filter in the morning, tyre in the
        // afternoon. Flagging this would train the owner to ignore the warning.
        history(record(LocalDate.of(2026, 3, 14), null, "2450.00", "RJ Motor Parts"));

        assertThat(service.check(draft(LocalDate.of(2026, 3, 14), null, "890.00", "RJ Motor Parts"), vehicle(null)))
                .isEmpty();
    }

    @Test
    void aDifferentShopOnTheSameDayForTheSameAmountIsNotADuplicate() {
        history(record(LocalDate.of(2026, 3, 14), null, "2450.00", "RJ Motor Parts"));

        assertThat(service.check(draft(LocalDate.of(2026, 3, 14), null, "2450.00", "Toyota Talisay"), vehicle(null)))
                .isEmpty();
    }

    @Test
    void aDraftIsNeverADuplicateOfTheRecordItAlreadyProduced() {
        // Confirming is re-runnable. Re-validating afterwards must not accuse
        // the draft of duplicating itself.
        UUID draftId = UUID.randomUUID();
        ServiceRecord confirmed = record(LocalDate.of(2026, 3, 14), 18452, "2450.00", "RJ Motor Parts");
        confirmed.setDraftId(draftId);
        history(confirmed);

        ServiceDraft draft = draft(LocalDate.of(2026, 3, 14), 18452, "2450.00", "RJ Motor Parts");
        // draftId is database-generated and has no setter; the check under test
        // reads it, so the test has to plant one.
        ReflectionTestUtils.setField(draft, "draftId", draftId);

        assertThat(service.check(draft, vehicle(null))).isEmpty();
    }

    // ---- fixtures --------------------------------------------------------

    private void history(ServiceRecord... rows) {
        when(records.findByVehicleIdAndOwnerId(eq(VEHICLE), eq(OWNER), any(Sort.class)))
                .thenReturn(List.of(rows));
    }

    private ServiceDraft draft(LocalDate date, Integer odometer, String totalCost) {
        return draft(date, odometer, totalCost, "Some Shop");
    }

    private ServiceDraft draft(LocalDate date, Integer odometer, String totalCost, String shop) {
        ServiceDraft draft = new ServiceDraft();
        draft.setVehicleId(VEHICLE);
        draft.setOwnerId(OWNER);
        draft.setInputMethod(InputMethod.RECEIPT);
        draft.setServiceDate(date);
        draft.setOdometer(odometer);
        draft.setTotalCost(totalCost == null ? null : new BigDecimal(totalCost));
        draft.setShopName(shop);
        return draft;
    }

    private ServiceRecord record(LocalDate date, Integer odometer, String totalCost, String shop) {
        ServiceRecord record = new ServiceRecord();
        record.setVehicleId(VEHICLE);
        record.setOwnerId(OWNER);
        record.setServiceDate(date);
        record.setOdometer(odometer);
        record.setTotalCost(totalCost == null ? null : new BigDecimal(totalCost));
        record.setShopName(shop);
        return record;
    }

    private VehicleProfile vehicle(Integer odometer) {
        VehicleProfile vehicle = new VehicleProfile();
        vehicle.setOdometer(odometer);
        return vehicle;
    }
}
