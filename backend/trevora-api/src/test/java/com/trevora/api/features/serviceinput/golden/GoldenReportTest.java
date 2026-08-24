package com.trevora.api.features.serviceinput.golden;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The guard on the guard.
 *
 * <p>{@link GoldenReport} decides whether receipt extraction has regressed, and
 * that decision only ever runs behind a paid API call. If the floor logic is
 * wrong, nobody finds out until a regression sails through — which is the exact
 * failure the floors exist to prevent. These are free and offline, so the
 * scoring rules are checked on every {@code ./mvnw test}.
 */
class GoldenReportTest {

    @Test
    void aFieldHoldingItsBaselinePasses() {
        GoldenReport report = new GoldenReport();
        report.record("case-a", List.of(score("lineKinds", 1.0), score("linePrices", 1.0)));

        assertThat(report.floorViolations()).isEmpty();
    }

    /**
     * The regression this whole apparatus was built for: line kinds went from
     * 100% to 36% twice during the audit, and both changes read as improvements
     * in the diff.
     */
    @Test
    void theCollapseThatUsedToShipCaughtNow() {
        GoldenReport report = new GoldenReport();
        report.record("case-a", List.of(score("lineKinds", 0.36)));

        assertThat(report.floorViolations()).singleElement(org.assertj.core.api.InstanceOfAssertFactories.STRING)
                .contains("lineKinds")
                .contains("36%")
                .contains("90%");
    }

    @Test
    void aFieldWithNoFloorIsNeverAViolation() {
        // relatedComponents measured 83-89% across runs of identical code. A
        // floor there would fire on noise.
        GoldenReport report = new GoldenReport();
        report.record("case-a", List.of(score("relatedComponents", 0.50)));

        assertThat(report.floorViolations()).isEmpty();
    }

    @Test
    void theToyotaCaseFailingTotalCostStaysUnderTheFloor() {
        // Two of three cases score totalCost, which is the 67% baseline. The
        // floor sits at 60% so the known-unreachable case does not break the
        // build every run.
        GoldenReport report = new GoldenReport();
        report.record("gta", List.of(score("totalCost", 1.0)));
        report.record("scooter", List.of(score("totalCost", 1.0)));
        report.record("toyota", List.of(score("totalCost", 0.0)));

        assertThat(report.floorViolations()).isEmpty();
    }

    @Test
    void oneMoreCaseFailingTotalCostDoesBreakIt() {
        GoldenReport report = new GoldenReport();
        report.record("gta", List.of(score("totalCost", 1.0)));
        report.record("scooter", List.of(score("totalCost", 0.0)));
        report.record("toyota", List.of(score("totalCost", 0.0)));

        assertThat(report.floorViolations()).singleElement(org.assertj.core.api.InstanceOfAssertFactories.STRING)
                .contains("totalCost");
    }

    /** Repeat runs are reduced by median, so one bad roll is not a regression. */
    @Test
    void oneBadRunAmongThreeDoesNotTripTheFloor() {
        GoldenReport report = new GoldenReport();
        report.record("case-a", List.of(score("lineKinds", 1.0)));
        report.record("case-a", List.of(score("lineKinds", 0.0)));
        report.record("case-a", List.of(score("lineKinds", 1.0)));

        assertThat(report.floorViolations()).isEmpty();
    }

    @Test
    void twoBadRunsAmongThreeDoTripIt() {
        GoldenReport report = new GoldenReport();
        report.record("case-a", List.of(score("lineKinds", 1.0)));
        report.record("case-a", List.of(score("lineKinds", 0.0)));
        report.record("case-a", List.of(score("lineKinds", 0.0)));

        assertThat(report.floorViolations()).isNotEmpty();
    }

    @Test
    void aFailedExtractionIsCountedAndPrintedRatherThanThrown() {
        GoldenReport report = new GoldenReport();
        report.record("case-a", List.of(score("lineKinds", 1.0)));
        report.recordFailure("case-b", "hit the response token limit");

        assertThat(report.attempts()).isEqualTo(2);
        assertThat(report.failures()).singleElement(org.assertj.core.api.InstanceOfAssertFactories.STRING)
                .contains("case-b")
                .contains("token limit");
        assertThat(report.render(1))
                .contains("EXTRACTIONS THAT PRODUCED NOTHING - 1 of 2")
                .contains("hit the response token limit");
    }

    @Test
    void aPendingGroundTruthIsSkippedNotScoredAsZero() {
        GoldenReport report = new GoldenReport();
        report.record("toyota", List.of(FieldScore.pending("linePrices")));

        assertThat(report.floorViolations())
                .as("an answer nobody has checked yet is not a regression")
                .isEmpty();
        assertThat(report.render(1)).contains("NOT SCORED");
    }

    private FieldScore score(String field, double value) {
        return new FieldScore(field, value, false, "");
    }
}
