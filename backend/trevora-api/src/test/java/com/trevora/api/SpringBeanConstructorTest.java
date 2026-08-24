package com.trevora.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Controller;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.RestController;

/**
 * Every Spring-managed class must offer exactly one way to be built.
 *
 * <p>Spring injects a single constructor implicitly. Add a second — a
 * package-private one for a test, say — and it will not choose: it looks for a
 * no-arg constructor, does not find one, and the whole application context
 * fails to start. One {@code @Autowired} on the real constructor resolves it.
 *
 * <p>This exists because that happened. A test-only constructor was added to
 * {@code OpenAIServiceDraftExtractionProvider} so a mock server could sit in
 * front of its retry loop; every unit test passed, because unit tests call
 * constructors directly, and the application would not boot. Nothing in the
 * suite loads the context — the real one needs Supabase — so nothing noticed.
 *
 * <p>Reflection rather than {@code @SpringBootTest} on purpose: this needs no
 * database, no credentials and no network, so it runs on every {@code mvnw
 * test} instead of only where a developer has the environment set up.
 */
class SpringBeanConstructorTest {

    private static final String BASE_PACKAGE = "com.trevora.api";

    @Test
    void everySpringManagedClassHasExactlyOneInjectableConstructor() {
        List<String> ambiguous = new ArrayList<>();

        for (Class<?> type : springManagedClasses()) {
            Constructor<?>[] constructors = type.getDeclaredConstructors();
            if (constructors.length <= 1) {
                continue;
            }
            long annotated = List.of(constructors).stream()
                    .filter(constructor -> constructor.isAnnotationPresent(Autowired.class))
                    .count();
            if (annotated != 1) {
                ambiguous.add(type.getSimpleName() + " has " + constructors.length
                        + " constructors and " + annotated + " marked @Autowired");
            }
        }

        assertThat(ambiguous)
                .as("a bean with several constructors and no @Autowired stops the context from starting")
                .isEmpty();
    }

    /** Sanity check on the scanner: a suite that finds nothing proves nothing. */
    @Test
    void theScanFindsTheApplicationsBeans() {
        assertThat(springManagedClasses())
                .as("the component scan should reach the feature packages")
                .hasSizeGreaterThan(20);
    }

    private List<Class<?>> springManagedClasses() {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        for (Class<? extends java.lang.annotation.Annotation> stereotype : List.of(
                Component.class, Service.class, Repository.class, Controller.class, RestController.class)) {
            scanner.addIncludeFilter(new AnnotationTypeFilter(stereotype));
        }

        List<Class<?>> types = new ArrayList<>();
        scanner.findCandidateComponents(BASE_PACKAGE).forEach(definition -> {
            try {
                types.add(Class.forName(definition.getBeanClassName()));
            } catch (ClassNotFoundException exception) {
                throw new IllegalStateException("Scanned a class that cannot be loaded", exception);
            }
        });
        return types;
    }
}
