package com.trevora.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.dto.SupabaseAuthenticatedUser;
import com.trevora.api.enums.UserRole;
import com.trevora.api.exception.AuthException;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class SupabaseAuthService {
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String REQUEST_ATTRIBUTE = SupabaseAuthService.class.getName() + ".user";

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String supabaseUrl;
    private final String supabaseAnonKey;

    public SupabaseAuthService(
            ObjectMapper objectMapper,
            @Value("${supabase.url:}") String supabaseUrl,
            @Value("${supabase.anon-key:}") String supabaseAnonKey
    ) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newHttpClient();
        this.supabaseUrl = trimTrailingSlash(supabaseUrl);
        this.supabaseAnonKey = supabaseAnonKey == null ? "" : supabaseAnonKey.trim();
    }

    public Optional<SupabaseAuthenticatedUser> getCurrentUser(HttpServletRequest request) {
        String token = bearerToken(request);
        if (token == null) {
            return Optional.empty();
        }

        Object cachedUser = request.getAttribute(REQUEST_ATTRIBUTE);
        if (cachedUser instanceof SupabaseAuthenticatedUser user) {
            return Optional.of(user);
        }

        SupabaseAuthenticatedUser user = fetchUser(token);
        request.setAttribute(REQUEST_ATTRIBUTE, user);
        return Optional.of(user);
    }

    public SupabaseAuthenticatedUser requireCurrentUser(HttpServletRequest request) {
        return getCurrentUser(request)
                .orElseThrow(() -> new AuthException("A valid Supabase session is required."));
    }

    private SupabaseAuthenticatedUser fetchUser(String token) {
        if (supabaseUrl.isBlank() || supabaseAnonKey.isBlank()) {
            throw new AuthException("Supabase Auth is not configured on the backend.");
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/auth/v1/user"))
                .header("Authorization", BEARER_PREFIX + token)
                .header("apikey", supabaseAnonKey)
                .GET()
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new AuthException("Supabase session is invalid or expired.");
            }
            return parseUser(response.body());
        } catch (IOException exception) {
            throw new AuthException("Unable to contact Supabase Auth.");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AuthException("Supabase Auth verification was interrupted.");
        }
    }

    private SupabaseAuthenticatedUser parseUser(String body) throws IOException {
        JsonNode root = objectMapper.readTree(body);
        UUID userId = UUID.fromString(requiredText(root, "id"));
        String email = requiredText(root, "email");
        JsonNode metadata = root.path("user_metadata");

        String firstName = text(metadata, "first_name");
        String lastName = text(metadata, "last_name");
        String fullName = text(metadata, "full_name");
        if (firstName.isBlank() && !fullName.isBlank()) {
            String[] parts = fullName.trim().split("\\s+", 2);
            firstName = parts[0];
            lastName = parts.length > 1 ? parts[1] : "";
        }

        return new SupabaseAuthenticatedUser(
                userId,
                email,
                firstName.isBlank() ? "User" : firstName,
                lastName,
                parseRole(text(metadata, "role"))
        );
    }

    private UserRole parseRole(String role) {
        if (role == null || role.isBlank()) {
            return UserRole.VEHICLE_OWNER;
        }
        try {
            return UserRole.valueOf(role.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            return UserRole.VEHICLE_OWNER;
        }
    }

    private String bearerToken(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        if (authorization == null || !authorization.startsWith(BEARER_PREFIX)) {
            return null;
        }
        String token = authorization.substring(BEARER_PREFIX.length()).trim();
        return token.isBlank() ? null : token;
    }

    private String requiredText(JsonNode node, String fieldName) {
        String value = text(node, fieldName);
        if (value.isBlank()) {
            throw new AuthException("Supabase user response is missing " + fieldName + ".");
        }
        return value;
    }

    private String text(JsonNode node, String fieldName) {
        JsonNode value = node.path(fieldName);
        return value.isTextual() ? value.asText().trim() : "";
    }

    private String trimTrailingSlash(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().replaceAll("/+$", "");
    }
}
