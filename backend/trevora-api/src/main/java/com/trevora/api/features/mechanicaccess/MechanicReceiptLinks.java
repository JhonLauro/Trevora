package com.trevora.api.features.mechanicaccess;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriUtils;

/**
 * Signs links to receipt photos in Supabase Storage with the service-role key.
 *
 * <p>The owner's pages sign their own links in the browser, and the bucket's
 * owner-only policy allows it. A mechanic is never signed in, so the same call
 * from their browser is refused with "Object not found" -- which is why shared
 * receipts showed only on the owner's own device.
 *
 * <p>The service-role key ignores those policies. This class therefore signs
 * whatever it is given, and must only be given paths read from a shared record
 * after {@link MechanicReceiptService} has checked the session and the folder.
 */
@Component
public class MechanicReceiptLinks {

    /* RFC 3986 characters that may stand in a URL as they are. '%' is kept so a
       path Storage has already escaped is not escaped twice. */
    private static final String URL_SAFE =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~!$&'()*+,;=:@/?%#[]";
    private static final char[] HEX = "0123456789ABCDEF".toCharArray();

    private final String supabaseUrl;
    private final String serviceRoleKey;
    // Built on first use, so a server nobody shares a receipt from opens no client.
    private RestClient restClient;

    public MechanicReceiptLinks(
            @Value("${supabase.url:}") String supabaseUrl,
            @Value("${supabase.service-role-key:}") String serviceRoleKey
    ) {
        this.supabaseUrl = trimTrailingSlash(blankToNull(supabaseUrl));
        this.serviceRoleKey = blankToNull(serviceRoleKey);
    }

    /** Whether links can be signed at all on this server. */
    public boolean available() {
        return supabaseUrl != null && serviceRoleKey != null;
    }

    /**
     * A link to one stored object that stops working after {@code expiresInSeconds},
     * or null when Storage holds no such object.
     *
     * @throws org.springframework.web.client.RestClientException when Storage cannot
     *     be reached or refuses the key
     */
    public String sign(String bucket, String path, long expiresInSeconds) {
        String signedPath = requestSignedPath(bucket, path, expiresInSeconds);
        if (signedPath == null || signedPath.isBlank()) {
            return null;
        }
        String relative = signedPath.startsWith("/") ? signedPath : "/" + signedPath;
        return supabaseUrl + "/storage/v1" + escapeUnsafe(relative);
    }

    /**
     * Storage's {@code signedURL}: "/object/sign/bucket/path?token=...", relative
     * to /storage/v1. Null for a missing object. Overridden in tests.
     */
    protected String requestSignedPath(String bucket, String path, long expiresInSeconds) {
        StringBuilder uri = new StringBuilder(supabaseUrl)
                .append("/storage/v1/object/sign/")
                .append(UriUtils.encodePathSegment(bucket, StandardCharsets.UTF_8));
        for (String segment : path.split("/")) {
            uri.append('/').append(UriUtils.encodePathSegment(segment, StandardCharsets.UTF_8));
        }

        try {
            Map<String, Object> body = client().post()
                    .uri(URI.create(uri.toString()))
                    .header("apikey", serviceRoleKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceRoleKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("expiresIn", expiresInSeconds))
                    .retrieve()
                    .body(new ParameterizedTypeReference<Map<String, Object>>() { });
            Object signed = body == null ? null : body.get("signedURL");
            return signed == null ? null : signed.toString();
        } catch (HttpClientErrorException refused) {
            // Storage answers a missing object with 400 "Object not found", or 404.
            // 401 and 403 mean the key is wrong, which is not the file's fault.
            HttpStatus status = HttpStatus.resolve(refused.getStatusCode().value());
            if (status == HttpStatus.BAD_REQUEST || status == HttpStatus.NOT_FOUND) {
                return null;
            }
            throw refused;
        }
    }

    static String escapeUnsafe(String value) {
        StringBuilder out = new StringBuilder(value.length());
        for (byte raw : value.getBytes(StandardCharsets.UTF_8)) {
            int c = raw & 0xff;
            if (c < 0x80 && URL_SAFE.indexOf(c) >= 0) {
                out.append((char) c);
            } else {
                out.append('%').append(HEX[c >> 4]).append(HEX[c & 0x0f]);
            }
        }
        return out.toString();
    }

    private RestClient client() {
        RestClient existing = this.restClient;
        if (existing == null) {
            existing = RestClient.create();
            this.restClient = existing;
        }
        return existing;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String trimTrailingSlash(String value) {
        if (value == null) {
            return null;
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
