package com.trevora.api.shared.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Prints every endpoint so the registry can be written from fact, not memory. */
class EndpointInventoryTest {

    @Test
    void listEndpoints() {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));

        Set<String> endpoints = new TreeSet<>();
        for (BeanDefinition definition : scanner.findCandidateComponents("com.trevora.api")) {
            Class<?> type;
            try {
                type = Class.forName(definition.getBeanClassName());
            } catch (ClassNotFoundException exception) {
                throw new IllegalStateException(exception);
            }
            String base = basePath(type);
            for (Method method : type.getDeclaredMethods()) {
                for (String line : describe(base, method)) {
                    endpoints.add(line);
                }
            }
        }
        endpoints.forEach(e -> System.out.println("ENDPOINT " + e));
        assertThat(endpoints).isNotEmpty();
    }

    private String basePath(Class<?> type) {
        RequestMapping mapping = type.getAnnotation(RequestMapping.class);
        return mapping == null || mapping.value().length == 0 ? "" : mapping.value()[0];
    }

    private Set<String> describe(String base, Method method) {
        Set<String> out = new LinkedHashSet<>();
        record Pair(Class<? extends Annotation> type, String verb) {}
        for (Pair pair : new Pair[]{
                new Pair(GetMapping.class, "GET"), new Pair(PostMapping.class, "POST"),
                new Pair(PutMapping.class, "PUT"), new Pair(PatchMapping.class, "PATCH"),
                new Pair(DeleteMapping.class, "DELETE")}) {
            Annotation found = method.getAnnotation(pair.type());
            if (found == null) continue;
            String[] paths = paths(found);
            if (paths.length == 0) paths = new String[]{""};
            for (String path : paths) {
                out.add(pair.verb() + " " + base + path);
            }
        }
        return out;
    }

    private String[] paths(Annotation annotation) {
        try {
            return (String[]) annotation.annotationType().getMethod("value").invoke(annotation);
        } catch (ReflectiveOperationException exception) {
            return new String[0];
        }
    }
}
