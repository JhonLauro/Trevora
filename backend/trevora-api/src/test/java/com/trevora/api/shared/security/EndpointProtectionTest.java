package com.trevora.api.shared.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.trevora.api.features.auth.CurrentUserService;
import java.lang.annotation.Annotation;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import org.junit.jupiter.api.DisplayName;
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

/**
 * There is no Spring Security in this project. No filter chain, no
 * {@code @PreAuthorize} -- every endpoint is open at the HTTP layer, and the
 * only thing between a stranger and somebody's service history is that each
 * service method remembers to ask whose data it is.
 *
 * <p>Today they all do. The danger is the next one: a controller method added
 * without that call compiles, starts, passes every other test, and quietly
 * serves any record to anyone who guesses an id. Nothing goes red.
 *
 * <p>This is the thing that goes red. It enforces two rules that can be checked
 * without parsing method bodies, so it should not rot:
 *
 * <ol>
 *   <li><b>Every endpoint is classified.</b> The registry below must match the
 *       application exactly. Add an endpoint and this fails until you write
 *       down how it is guarded -- which is the moment to think about it.</li>
 *   <li><b>Owner endpoints can actually identify the owner.</b> A controller
 *       serving them must reach {@link CurrentUserService} through its
 *       dependencies. A service with no route to the current user cannot be
 *       checking ownership, whatever its method bodies claim.</li>
 * </ol>
 *
 * <p>What this deliberately does not do is prove a given method calls the
 * check. That needs real call-graph analysis, and a half-working approximation
 * would fail on ordinary refactors until somebody deleted it. Classification
 * plus reachability catches the realistic mistake -- a new endpoint nobody
 * thought about -- without overstating what it verifies.
 */
class EndpointProtectionTest {

    /** How an endpoint is guarded. */
    private enum Guard {
        /** Belongs to the signed-in owner; must reach an ownership check. */
        OWNER,
        /** A mechanic's approved session: session id plus its token. Not owner-scoped. */
        SESSION,
        /** Signed in, but about the caller themselves rather than a resource. */
        SELF,
        /** Deliberately unauthenticated. Every entry here is a decision, not an oversight. */
        PUBLIC
    }

    private static final Map<String, Guard> REGISTRY;

    static {
        Map<String, Guard> registry = new HashMap<>();

        // -- unauthenticated on purpose ------------------------------------
        registry.put("GET /health", Guard.PUBLIC);
        registry.put("POST /api/auth/login", Guard.PUBLIC);
        registry.put("POST /api/auth/register", Guard.PUBLIC);
        // A mechanic scans a QR and has no account. The token in the path is
        // the credential; these three are the whole pre-approval handshake.
        registry.put("GET /api/qr-access/requests/{token}", Guard.PUBLIC);
        registry.put("POST /api/qr-access/requests/{token}/mechanic-request", Guard.PUBLIC);
        registry.put("GET /api/qr-access/requests/{token}/mechanic-request/status", Guard.PUBLIC);

        // -- the caller's own account --------------------------------------
        registry.put("GET /api/auth/me", Guard.SELF);
        registry.put("POST /api/auth/me/walkthrough/seen", Guard.SELF);
        registry.put("POST /api/auth/sync", Guard.SELF);
        registry.put("DELETE /api/auth/account", Guard.SELF);

        // -- mechanic session: id + token, checked in MechanicAccessService --
        registry.put("GET /api/mechanic-access/sessions/{sessionId}/history", Guard.SESSION);
        registry.put("GET /api/mechanic-access/sessions/{sessionId}/history/search", Guard.SESSION);
        registry.put("GET /api/mechanic-access/sessions/{sessionId}/history/{recordId}", Guard.SESSION);

        // -- owner-scoped: everything that touches somebody's vehicles -------
        registry.put("GET /api/garage", Guard.OWNER);
        registry.put("GET /api/vehicles", Guard.OWNER);
        registry.put("POST /api/vehicles", Guard.OWNER);
        registry.put("GET /api/vehicles/{vehicleId}", Guard.OWNER);
        registry.put("PUT /api/vehicles/{vehicleId}", Guard.OWNER);
        registry.put("DELETE /api/vehicles/{vehicleId}", Guard.OWNER);
        registry.put("GET /api/vehicles/{vehicleId}/history", Guard.OWNER);
        registry.put("GET /api/vehicles/{vehicleId}/history/{recordId}", Guard.OWNER);
        registry.put("DELETE /api/vehicles/{vehicleId}/history/{recordId}", Guard.OWNER);
        registry.put("POST /api/vehicles/{vehicleId}/history/{recordId}/reviewed", Guard.OWNER);
        registry.put("GET /api/service-records/{recordId}/ai-explanation", Guard.OWNER);
        registry.put("GET /api/service-drafts/{draftId}", Guard.OWNER);
        registry.put("DELETE /api/service-drafts/{draftId}", Guard.OWNER);
        registry.put("GET /api/service-drafts/{draftId}/review", Guard.OWNER);
        registry.put("POST /api/service-drafts/{draftId}/validate", Guard.OWNER);
        registry.put("PATCH /api/service-drafts/{draftId}/corrections", Guard.OWNER);
        registry.put("POST /api/service-drafts/{draftId}/confirm", Guard.OWNER);
        registry.put("POST /api/service-drafts/manual", Guard.OWNER);
        registry.put("POST /api/service-drafts/receipt", Guard.OWNER);
        registry.put("POST /api/service-drafts/voice", Guard.OWNER);
        registry.put("POST /api/service-drafts/voice/transcribe", Guard.OWNER);
        registry.put("POST /api/service-drafts/voice/translate", Guard.OWNER);
        registry.put("GET /api/qr-access/requests", Guard.OWNER);
        registry.put("POST /api/qr-access/requests", Guard.OWNER);
        registry.put("GET /api/mechanic-access/requests", Guard.OWNER);
        registry.put("GET /api/mechanic-access/requests/pending", Guard.OWNER);
        registry.put("POST /api/mechanic-access/requests/{requestId}/approve", Guard.OWNER);
        registry.put("POST /api/mechanic-access/requests/{requestId}/deny", Guard.OWNER);
        registry.put("GET /api/mechanic-access/owner/sessions", Guard.OWNER);
        registry.put("POST /api/mechanic-access/owner/sessions/{sessionId}/revoke", Guard.OWNER);

        REGISTRY = new TreeMap<>(registry);
    }

    @Test
    @DisplayName("every endpoint is classified, so a new one fails until someone says how it is guarded")
    void everyEndpointIsClassified() {
        Set<String> live = new TreeSet<>();
        forEachEndpoint((controller, endpoint) -> live.add(endpoint));

        Set<String> unclassified = new TreeSet<>(live);
        unclassified.removeAll(REGISTRY.keySet());

        Set<String> stale = new TreeSet<>(REGISTRY.keySet());
        stale.removeAll(live);

        assertThat(unclassified)
                .as("New endpoints with no declared guard. Add each to REGISTRY in this test "
                        + "and, if it is OWNER, make sure the service scopes by the current user first")
                .isEmpty();

        assertThat(stale)
                .as("REGISTRY names endpoints that no longer exist; delete these entries")
                .isEmpty();
    }

    @Test
    @DisplayName("controllers serving owner data can reach the current user")
    void ownerEndpointsCanIdentifyTheOwner() {
        List<String> unreachable = new ArrayList<>();

        forEachEndpoint((controller, endpoint) -> {
            if (REGISTRY.get(endpoint) != Guard.OWNER) {
                return;
            }
            if (!reachesCurrentUserService(controller, new LinkedHashSet<>(), 0)) {
                unreachable.add(endpoint + "  (" + controller.getSimpleName() + ")");
            }
        });

        assertThat(unreachable)
                .as("These serve owner data through services with no route to CurrentUserService, "
                        + "so they cannot be checking who is asking")
                .isEmpty();
    }

    /**
     * Whether this class can resolve the caller, directly or through a
     * collaborator: controller to service to helper service.
     */
    private boolean reachesCurrentUserService(Class<?> type, Set<Class<?>> seen, int depth) {
        if (type == CurrentUserService.class) {
            return true;
        }
        if (depth > 3 || !type.getName().startsWith("com.trevora.api") || !seen.add(type)) {
            return false;
        }
        for (Field field : type.getDeclaredFields()) {
            if (reachesCurrentUserService(field.getType(), seen, depth + 1)) {
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------ scanning

    private interface EndpointVisitor {
        void visit(Class<?> controller, String endpoint);
    }

    private void forEachEndpoint(EndpointVisitor visitor) {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));

        for (BeanDefinition definition : scanner.findCandidateComponents("com.trevora.api")) {
            Class<?> controller;
            try {
                controller = Class.forName(definition.getBeanClassName());
            } catch (ClassNotFoundException exception) {
                throw new IllegalStateException("Could not load controller", exception);
            }
            RequestMapping base = controller.getAnnotation(RequestMapping.class);
            String prefix = base == null || base.value().length == 0 ? "" : base.value()[0];

            for (Method method : controller.getDeclaredMethods()) {
                for (String endpoint : endpointsOf(prefix, method)) {
                    visitor.visit(controller, endpoint);
                }
            }
        }
    }

    private Set<String> endpointsOf(String prefix, Method method) {
        Set<String> found = new LinkedHashSet<>();
        collect(found, prefix, method.getAnnotation(GetMapping.class), "GET");
        collect(found, prefix, method.getAnnotation(PostMapping.class), "POST");
        collect(found, prefix, method.getAnnotation(PutMapping.class), "PUT");
        collect(found, prefix, method.getAnnotation(PatchMapping.class), "PATCH");
        collect(found, prefix, method.getAnnotation(DeleteMapping.class), "DELETE");
        return found;
    }

    private void collect(Set<String> found, String prefix, Annotation annotation, String verb) {
        if (annotation == null) {
            return;
        }
        String[] paths;
        try {
            paths = (String[]) annotation.annotationType().getMethod("value").invoke(annotation);
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException(exception);
        }
        if (paths.length == 0) {
            paths = new String[]{""};
        }
        for (String path : paths) {
            found.add(verb + " " + prefix + path);
        }
    }
}
