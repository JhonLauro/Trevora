package com.trevora.api.features.vehicle;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * The three cases a PATCH body has to keep apart.
 *
 * <p>An absent field means "leave it alone" and an explicit null means "clear
 * it", and if those two collapse into each other the endpoint can set a
 * warranty term but never remove one — silently, with a 200 and a screen that
 * simply does not change.
 *
 * <p>They do collapse under the two obvious designs. A record maps a missing
 * component to null, which is what an explicit null gives too; and
 * {@code Optional<T>} maps <i>both</i> to {@code Optional.empty()} — that was
 * measured against this project's own ObjectMapper, not assumed, and it is why
 * {@link PatchVehicleRequest} is a mutable class whose setters record that they
 * ran. This test is the thing that fails if anyone tidies it back into a
 * record.
 *
 * <p>Deserialised through the application's real Jackson configuration rather
 * than a hand-built mapper, since the behaviour under test is a property of
 * that configuration.
 */
class PatchVehicleRequestTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration.class));

    private void withMapper(MapperCase body) {
        contextRunner.run(context -> body.run(context.getBean(ObjectMapper.class)));
    }

    @FunctionalInterface
    interface MapperCase {
        void run(ObjectMapper mapper) throws Exception;
    }

    @Test
    void anAbsentFieldIsNotProvided() {
        withMapper(mapper -> {
            PatchVehicleRequest request = mapper.readValue("{\"plateNumber\":\"ABC 1234\"}",
                    PatchVehicleRequest.class);

            assertThat(request.has("plateNumber")).isTrue();
            assertThat(request.has("warrantyMonths")).isFalse();
            assertThat(request.has("make")).isFalse();
            assertThat(request.providedFields()).containsExactly("plateNumber");
        });
    }

    /** The case both obvious designs get wrong. */
    @Test
    void anExplicitNullIsProvided() {
        withMapper(mapper -> {
            PatchVehicleRequest request = mapper.readValue("{\"warrantyMonths\":null}",
                    PatchVehicleRequest.class);

            assertThat(request.has("warrantyMonths")).isTrue();
            assertThat(request.getWarrantyMonths()).isNull();
        });
    }

    @Test
    void aValueIsProvidedAndParsed() {
        withMapper(mapper -> {
            PatchVehicleRequest request = mapper.readValue(
                    "{\"warrantyMonths\":36,\"warrantyKmLimit\":100000,\"warrantyStartDate\":\"2025-03-14\"}",
                    PatchVehicleRequest.class);

            assertThat(request.getWarrantyMonths()).isEqualTo(36);
            assertThat(request.getWarrantyKmLimit()).isEqualTo(100_000);
            assertThat(request.getWarrantyStartDate()).isEqualTo(LocalDate.of(2025, 3, 14));
            assertThat(request.providedFields())
                    .containsExactlyInAnyOrder("warrantyMonths", "warrantyKmLimit", "warrantyStartDate");
        });
    }

    @Test
    void anEmptyBodyProvidesNothing() {
        withMapper(mapper -> {
            PatchVehicleRequest request = mapper.readValue("{}", PatchVehicleRequest.class);

            assertThat(request.isEmpty()).isTrue();
        });
    }

    /**
     * A body carrying only fields this endpoint does not know is still empty.
     *
     * <p>Spring Boot ignores unknown properties, so a caller that misspells
     * every key gets a request that changes nothing. The service refuses an
     * empty patch rather than answering 200 to it — see
     * {@code VehicleService.patchVehicleForCurrentUser}.
     */
    @Test
    void unknownKeysDoNotCountAsProvided() {
        withMapper(mapper -> {
            PatchVehicleRequest request = mapper.readValue(
                    "{\"warranty_months\":36,\"colour\":\"red\"}", PatchVehicleRequest.class);

            assertThat(request.isEmpty()).isTrue();
        });
    }

    /** A dialog editing four registration fields names four fields, and no more. */
    @Test
    void carriesOnlyWhatTheEditorSent() {
        withMapper(mapper -> {
            PatchVehicleRequest request = mapper.readValue(
                    "{\"plateNumber\":\"XYZ 9876\",\"vinChassisNumber\":null,"
                            + "\"year\":2018,\"odometer\":42300}",
                    PatchVehicleRequest.class);

            assertThat(request.providedFields())
                    .containsExactlyInAnyOrder("plateNumber", "vinChassisNumber", "year", "odometer");
            // The warranty is not mentioned, so nothing downstream can touch it.
            assertThat(request.has("warrantyStartDate")).isFalse();
            assertThat(request.has("warrantyMonths")).isFalse();
            assertThat(request.has("warrantyKmLimit")).isFalse();
        });
    }
}
