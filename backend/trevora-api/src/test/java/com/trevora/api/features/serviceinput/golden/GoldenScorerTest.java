package com.trevora.api.features.serviceinput.golden;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.serviceinput.ServiceClassification;
import com.trevora.api.features.serviceinput.ServiceClassificationService;
import com.trevora.api.features.serviceinput.ServiceLineEntryFields;
import com.trevora.api.features.serviceinput.VehicleContext;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * The scorer is the instrument, so it is tested like one — a bad scorer
 * reports confident nonsense and nobody notices.
 *
 * <p>Runs in the normal suite. No API key, no network, no cost.
 */
class GoldenScorerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void moneyComparesByValueNotScale() {
        assertThat(GoldenScorer.money("totalCost", new BigDecimal("3325.00"), new BigDecimal("3325")).score())
                .isEqualTo(1.0);
        assertThat(GoldenScorer.money("totalCost", new BigDecimal("3325.00"), new BigDecimal("3325.000")).score())
                .isEqualTo(1.0);
    }

    @Test
    void moneyFailsOnTheFourHundredPesoDrift() {
        // 12,046.04 is the printed total: it appears in the OCR text verbatim
        // and the two job subtotals 7,600.00 and 4,446.04 sum to it. The first
        // golden run returned 12,446.04 on all three attempts, so this is a
        // reproducible misreading rather than a bad roll -- and it is exactly
        // what reconciling the lines against the total would catch.
        assertThat(GoldenScorer.money("totalCost", new BigDecimal("12046.04"), new BigDecimal("12446.04")).score())
                .isEqualTo(0.0);
    }

    @Test
    void inventingAValueThatIsNotOnTheReceiptIsAFailure() {
        // A receipt with no odometer, extracted with one, is worse than blank.
        assertThat(GoldenScorer.exact("odometer", null, "65000").score()).isEqualTo(0.0);
        assertThat(GoldenScorer.exact("odometer", null, null).score()).isEqualTo(1.0);
    }

    @Test
    void shopNameToleratesTheOcrMisreadButNotADifferentShop() {
        // Four production runs read "Auio" for "Auto". That is the scanner's
        // error, and scoring it as an extraction failure measures the wrong thing.
        assertThat(GoldenScorer.similar("shopName", "GTA Auto Services", "GTA Auio Services",
                GoldenScorer.SHOP_NAME_THRESHOLD).score()).isEqualTo(1.0);
        assertThat(GoldenScorer.similar("shopName", "GTA Auto Services", "Toyota Talisay, Cebu",
                GoldenScorer.SHOP_NAME_THRESHOLD).score()).isEqualTo(0.0);
    }

    @Test
    void componentsScorePartialCreditByF1() {
        FieldScore perfect = GoldenScorer.f1("relatedComponents",
                Set.of("Electrical", "Cooling System"), Set.of("Cooling System", "Electrical"));
        assertThat(perfect.score()).isEqualTo(1.0);

        FieldScore half = GoldenScorer.f1("relatedComponents",
                Set.of("Electrical", "Cooling System"), Set.of("Cooling System"));
        assertThat(half.score()).isBetween(0.6, 0.7);

        FieldScore wrong = GoldenScorer.f1("relatedComponents",
                Set.of("Body"), Set.of("Brakes"));
        assertThat(wrong.score()).isEqualTo(0.0);
    }

    @Test
    void lineKindsMatchByDescriptionNotPosition() {
        // Receipt order is not meaningful; a correct extraction that reorders
        // must not score zero.
        var expected = json("""
                [ { "kind": "PART",      "description": "CONDENSER",         "lineTotal": 150.00 },
                  { "kind": "OPERATION", "description": "REPLACE CONDENSER", "lineTotal": 350.00 } ]
                """);
        List<ServiceLineEntryFields> actual = List.of(
                line("OPERATION", "Replace condenser", "350.00"),
                line("PART", "Condenser", "150.00")
        );
        assertThat(GoldenScorer.lineKinds(expected, actual).score()).isEqualTo(1.0);
    }

    @Test
    void tellingAPartFromItsOperationIsWhatLineKindsMeasures() {
        // "CONDENSER" and "REPLACE CONDENSER" are one part and one operation.
        // Calling both PART is the failure migration 011 exists to catch.
        var expected = json("""
                [ { "kind": "PART",      "description": "CONDENSER",         "lineTotal": 150.00 },
                  { "kind": "OPERATION", "description": "REPLACE CONDENSER", "lineTotal": 350.00 } ]
                """);
        List<ServiceLineEntryFields> actual = List.of(
                line("PART", "CONDENSER", "150.00"),
                line("PART", "REPLACE CONDENSER", "350.00")
        );
        assertThat(GoldenScorer.lineKinds(expected, actual).score()).isBetween(0.4, 0.6);
    }

    @Test
    void todaysBaselineIsZeroBecauseNoLinesAreEverExtracted() {
        // The prompt never asks for lineEntries, so every receipt-sourced draft
        // arrives with none. This is the number the golden set exists to move.
        var expected = json("""
                [ { "kind": "PART", "description": "CONDENSER", "lineTotal": 150.00 } ]
                """);
        assertThat(GoldenScorer.lineKinds(expected, List.of()).score()).isEqualTo(0.0);
    }

    @Test
    void reconciliationCatchesTheMangledThermostatPrice() {
        // The GTA receipt prints REPLACE THERMOSTAT as "350.¢". Drop it and the
        // lines sum 350.00 short of the printed total — which is the whole point.
        List<ServiceLineEntryFields> short_ = List.of(
                line("PART", "DISTRIBUTOR TRANSPANDER", "950.00"),
                line("PART", "CONDENSER", "150.00"),
                line("PART", "TEMPERATURE SENSOR", "325.00"),
                line("OPERATION", "REPLACE DISTRIBUTOR TRANSPANDER", "850.00"),
                line("OPERATION", "REPLACE CONDENSER", "350.00"),
                line("OPERATION", "REPLACE TEMPERATURE SENSOR", "350.00")
        );
        FieldScore missed = GoldenScorer.reconciles(short_, new BigDecimal("3325.00"));
        assertThat(missed.score()).isEqualTo(0.0);
        assertThat(missed.detail()).contains("gap 350.00");
    }

    @Test
    void reconciliationPassesWhenEveryLineIsRead() {
        List<ServiceLineEntryFields> complete = List.of(
                line("PART", "DISTRIBUTOR TRANSPANDER", "950.00"),
                line("PART", "CONDENSER", "150.00"),
                line("PART", "TEMPERATURE SENSOR", "325.00"),
                line("OPERATION", "REPLACE DISTRIBUTOR TRANSPANDER", "850.00"),
                line("OPERATION", "REPLACE CONDENSER", "350.00"),
                line("OPERATION", "REPLACE TEMPERATURE SENSOR", "350.00"),
                line("OPERATION", "REPLACE THERMOSTAT", "350.00")
        );
        assertThat(GoldenScorer.reconciles(complete, new BigDecimal("3325.00")).score()).isEqualTo(1.0);
    }

    @Test
    void reconciliationIsNotScoredWhenThereIsNothingToSum() {
        assertThat(GoldenScorer.reconciles(List.of(), new BigDecimal("3325.00")).skipped()).isTrue();
    }

    @Test
    void bothCasesLoadAndDeclareWhatTheyTest() {
        List<GoldenCase> cases = GoldenCase.loadAll();
        assertThat(cases).hasSizeGreaterThanOrEqualTo(2);
        for (GoldenCase goldenCase : cases) {
            assertThat(goldenCase.ocrText()).isNotBlank();
            assertThat(goldenCase.meta().path("why")).isNotEmpty();
            assertThat(goldenCase.expected()).isNotNull();
        }
    }

    @Test
    void redactionHeldAcrossTheWholeSet() {
        // A committed receipt with a live mobile number or VIN is a privacy
        // incident, not a test failure. Cheap to check, so it is checked.
        for (GoldenCase goldenCase : GoldenCase.loadAll()) {
            String text = goldenCase.ocrText();
            assertThat(text)
                    .as("%s must not contain a PH mobile number", goldenCase.id())
                    .doesNotContainPattern("\\+639(?!0{9})\\d{9}");
            assertThat(text)
                    .as("%s must not contain the original customer surname", goldenCase.id())
                    .doesNotContain("UNABIA");
        }
    }

    @Test
    void eachCaseCarriesTheVehicleTheExtractorWillBeToldAbout() {
        VehicleContext car = GoldenCase.load("toyota-talisay-body-paint").vehicleContext();
        assertThat(car.vehicleClass()).isEqualTo("car");
        assertThat(car.isMotorcycle()).isFalse();
        assertThat(car.make()).isEqualTo("Toyota");

        VehicleContext bike = GoldenCase.load("scooter-cvt-service").vehicleContext();
        assertThat(bike.vehicleClass()).isEqualTo("motorcycle");
        assertThat(bike.isMotorcycle()).isTrue();
        assertThat(bike.bodyType()).isEqualTo("scooter");
    }

    @Test
    void allThreeTwoWheelerBodyTypesResolveToTheMotorcycleTaxonomy() {
        // scooter and underbone arrived with the sub-type split; motorcycle is
        // the big bike and every row created before that split.
        assertThat(VehicleContext.vehicleClassFor("scooter")).isEqualTo("motorcycle");
        assertThat(VehicleContext.vehicleClassFor("underbone")).isEqualTo("motorcycle");
        assertThat(VehicleContext.vehicleClassFor("motorcycle")).isEqualTo("motorcycle");
        assertThat(VehicleContext.vehicleClassFor("sedan")).isEqualTo("car");
        // Unknown and missing fall to car, which is what every vehicle created
        // before the body-type picker is, and the list that over-claims least.
        assertThat(VehicleContext.vehicleClassFor(null)).isEqualTo("car");
        assertThat(VehicleContext.vehicleClassFor("spaceship")).isEqualTo("car");
    }

    @Test
    void aMotorcycleIsOfferedItsDrivetrainAndNeverAnAircon() {
        List<String> bike = GoldenCase.load("scooter-cvt-service").vehicleContext().allowedComponents();

        // The label that did not exist, and whose absence made a scooter's most
        // common service unclassifiable.
        assertThat(bike).contains("Drive Chain / CVT", "Fairings");
        assertThat(bike).doesNotContain("Transmission", "AC System", "Body");
    }

    @Test
    void aCarIsOfferedItsOwnListAndNotTheBikeOne() {
        List<String> car = GoldenCase.load("toyota-talisay-body-paint").vehicleContext().allowedComponents();

        assertThat(car).contains("Transmission", "AC System", "Body");
        assertThat(car).doesNotContain("Drive Chain / CVT", "Fairings");
    }

    @Test
    void theVehicleBlockOmitsWhatIsNotKnown() {
        // "Model: null" invites the model to reason about the absence instead
        // of simply not having the information.
        String block = new VehicleContext("motorcycle", "scooter", "Honda", null, null, null, null)
                .toPromptBlock();

        assertThat(block).contains("Vehicle class: motorcycle");
        assertThat(block).contains("Body type: scooter");
        assertThat(block).contains("Make: Honda");
        assertThat(block).doesNotContain("null");
        assertThat(block).doesNotContain("Model:");
    }

    @Test
    void componentsOutsideTheVehiclesClassAreDroppedRatherThanStored() {
        // The failure this whole change exists to end: a scooter CVT service
        // classified as Transmission, which a motorcycle does not have, so the
        // record attributed to nothing and left the parts map.
        ServiceClassificationService service = new ServiceClassificationService();
        ServiceClassification fromAi = new ServiceClassification(
                "CVT Service", "Maintenance", List.of("Transmission"), List.of(),
                "high", "AI", List.of(), false);

        ServiceClassification onABike = service.classifyAiOrFallback(
                fromAi, "CVT CLEANING", "CVT Service", null, null, null, 1,
                GoldenCase.load("scooter-cvt-service").vehicleContext());

        assertThat(onABike.relatedComponents()).doesNotContain("Transmission");
        assertThat(onABike.notes()).anyMatch(note -> note.contains("not a component a motorcycle has"));

        // The same label on a car is untouched.
        ServiceClassification onACar = service.classifyAiOrFallback(
                fromAi, "CVT CLEANING", "CVT Service", null, null, null, 1,
                GoldenCase.load("toyota-talisay-body-paint").vehicleContext());
        assertThat(onACar.relatedComponents()).contains("Transmission");
    }

    private static com.fasterxml.jackson.databind.JsonNode json(String raw) {
        try {
            return MAPPER.readTree(raw);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static ServiceLineEntryFields line(String kind, String description, String total) {
        return new ServiceLineEntryFields(kind, description, null, null, null, new BigDecimal(total));
    }
}
