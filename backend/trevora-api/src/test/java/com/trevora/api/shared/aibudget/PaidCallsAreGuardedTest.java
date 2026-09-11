package com.trevora.api.shared.aibudget;

import static org.assertj.core.api.Assertions.assertThat;

import com.trevora.api.features.ai.OpenAIExplanationProvider;
import com.trevora.api.features.mechanicaccess.MechanicSearchService;
import com.trevora.api.features.serviceinput.GoogleVisionOCRProvider;
import com.trevora.api.features.serviceinput.OpenAIServiceDraftExtractionProvider;
import com.trevora.api.features.serviceinput.VoiceTranscriptionService;
import java.io.IOException;
import java.lang.reflect.Constructor;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Every class that spends money on a paid AI API is built with the spend guard.
 *
 * <p>Several of these keep a second, public constructor with no guard, for tests
 * and the golden-set harness to build them directly. That is safe only because
 * Spring builds them through the other one. This checks the constructor Spring
 * actually uses, and scans the source for the providers' URLs so a new paid call
 * added somewhere else fails here until it is guarded too.
 */
class PaidCallsAreGuardedTest {

    private static final List<Class<?>> PAID_CALLERS = List.of(
            GoogleVisionOCRProvider.class,
            OpenAIServiceDraftExtractionProvider.class,
            OpenAIExplanationProvider.class,
            MechanicSearchService.class,
            VoiceTranscriptionService.class);

    private static final List<String> PAID_API_HOSTS = List.of("api.openai.com", "vision.googleapis.com");

    @Test
    @DisplayName("the constructor Spring uses for each paid caller takes the spend guard")
    void springBuildsPaidCallersWithTheGuard() {
        List<String> unguarded = new ArrayList<>();
        for (Class<?> type : PAID_CALLERS) {
            if (!Arrays.asList(springConstructor(type).getParameterTypes()).contains(AiSpendGuard.class)) {
                unguarded.add(type.getSimpleName());
            }
        }
        assertThat(unguarded)
                .as("these would call a paid API with no app-wide spending limit")
                .isEmpty();
    }

    @Test
    @DisplayName("every source file that calls a paid API host is one of the guarded callers")
    void noUnguardedPaidCallersInTheSource() throws IOException {
        List<String> guardedFiles = PAID_CALLERS.stream().map(type -> type.getSimpleName() + ".java").toList();
        List<String> unknown = new ArrayList<>();
        try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file);
                boolean callsPaidApi = PAID_API_HOSTS.stream().anyMatch(source::contains);
                if (callsPaidApi && !guardedFiles.contains(file.getFileName().toString())) {
                    unknown.add(file.toString());
                }
            }
        }
        assertThat(unknown)
                .as("a new caller of a paid API must use AiSpendGuard and be added to PAID_CALLERS")
                .isEmpty();
    }

    private static Constructor<?> springConstructor(Class<?> type) {
        Constructor<?>[] constructors = type.getDeclaredConstructors();
        if (constructors.length == 1) {
            return constructors[0];
        }
        return Arrays.stream(constructors)
                .filter(constructor -> constructor.isAnnotationPresent(Autowired.class))
                .findFirst()
                .orElseThrow(() -> new AssertionError(type.getSimpleName() + " has no @Autowired constructor"));
    }
}
