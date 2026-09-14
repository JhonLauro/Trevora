package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class ReplayScorerTest {

    private static final ReplayScorer.AnswerKey PALMETTO = ReplayScorer.load("replay/palmetto-answer-key.json");
    private static final BigDecimal TOTAL = new BigDecimal("256.79");
    private static final BigDecimal COVERED = new BigDecimal("56.79");
    private static final String REMARKS = "Cause: perform transmission CVT fluid service";

    private static ServiceLineEntryFields line(String kind, String description, String partCode, String amount) {
        return new ServiceLineEntryFields(kind, description, partCode, null, null,
                amount == null ? null : new BigDecimal(amount));
    }

    private static List<ServiceLineEntryFields> correct() {
        return List.of(
                line("OPERATION", "PERFORM CVT TRANSMISSION FLUID SERVICE", "WCVT", "134.27"),
                line("PART", "CVT ENHANCER", "66001", "27.99"),
                line("PART", "SYN / CVT 5QT", "EE5501", "77.73"),
                line("OPERATION", "MPI MULTI POINT INSPECTION", "115356 ISPN", "0"),
                line("OPERATION", "TIRE CONDITION GOOD", "115356 ISPN", "0"));
    }

    @Test
    void theConfirmedAnswerScoresExact() {
        ReplayScorer.RunScore score = ReplayScorer.score(PALMETTO, correct(), TOTAL, COVERED, REMARKS);

        assertThat(score.exact()).isTrue();
    }

    /** The run after PR #76: every amount right, and the rows wrong anyway. */
    @Test
    void rightMoneyOnWrongRowsIsNotExact() {
        List<ServiceLineEntryFields> run = List.of(
                line("OPERATION", "PERFORM CVT TRANSMISSION FLUID SERVICE", "WCVT", "134.27"),
                line("PART", "TRANSMISSION FLUID", "66001 / E85501", "27.99"),
                line("PART", "ENHANCER", "66001EE5501", "77.73"),
                line("OPERATION", "MPI MULTI POINT INSPECTION", "115356 ISPN", "0"),
                line("OPERATION", "TIRE CONDITION GOOD", "115356 ISPN", "0"));

        ReplayScorer.RunScore score = ReplayScorer.score(PALMETTO, run, TOTAL, COVERED, REMARKS);

        assertThat(score.exact()).isFalse();
        ReplayScorer.LineScore enhancer = score.lines().get(1);
        assertThat(enhancer.found()).isTrue();
        assertThat(enhancer.descriptionOk()).isFalse();
        assertThat(enhancer.amountOk()).isFalse();
        assertThat(enhancer.partCodeOk()).isFalse();
        assertThat(score.lines().get(2).found()).as("SYN / CVT 5QT").isFalse();
        assertThat(score.invented()).singleElement().asString().contains("TRANSMISSION FLUID");
    }

    @Test
    void visionsMisreadOf5qtIsNotTheModelsMistake() {
        List<ServiceLineEntryFields> run = new java.util.ArrayList<>(correct());
        run.set(2, line("PART", "SYN/CVT 50T", "EE5501", "77.73"));

        assertThat(ReplayScorer.score(PALMETTO, run, TOTAL, COVERED, REMARKS).exact()).isTrue();
    }

    @Test
    void theTotalsAndRemarksCountToo() {
        ReplayScorer.RunScore score = ReplayScorer.score(PALMETTO, correct(), new BigDecimal("200.00"), null, null);

        assertThat(score.totalOk()).isFalse();
        assertThat(score.coveredOk()).isFalse();
        assertThat(score.remarksOk()).isFalse();
        assertThat(score.exact()).isFalse();
    }

    @Test
    void layoutPairsReadTheRowsOurRebuildingProduced() {
        String shifted = String.join("\n",
                "115356CPNTN | 1.00",
                "1 EE5501 | ENHANCER | 134.27 | 134.27",
                "PARTS : | SYN / CVT 50T | 27.99 | 27.99 | 27.99");
        String straight = String.join("\n",
                "115356CPNTN | 1.00 | 134.27 | 134.27",
                "1 66001 | CVT ENHANCER | 27.99 | 27.99 | 27.99",
                "1 EE5501 | SYN / CVT 50T | 77.73 | 77.73 | 77.73");

        assertThat(ReplayScorer.layoutPairs(PALMETTO, shifted)).noneMatch(ReplayScorer.LayoutPair::sameRow);
        assertThat(ReplayScorer.layoutPairs(PALMETTO, straight)).hasSize(3).allMatch(ReplayScorer.LayoutPair::sameRow);
    }
}
