package com.trevora.api.shared.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.SupabaseAuthService;
import com.trevora.api.features.mechanicaccess.MechanicAccessSession;
import com.trevora.api.features.mechanicaccess.MechanicAccessSessionRepository;
import com.trevora.api.shared.aibudget.AiSpendContext;
import com.trevora.api.shared.exception.AccountSuspendedException;
import com.trevora.api.shared.exception.ApiErrorResponse;
import com.trevora.api.shared.ratelimit.AiFeatureLimits.Feature;
import com.trevora.api.shared.ratelimit.AiFeatureLimits.Limit;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Rate limits the endpoints that call a paid third-party API on our key, per caller
 * and per feature, and tells the spend guard who each paid request is for.
 *
 * <p>Only these endpoints are limited. Reading a vehicle costs a database query;
 * reading a receipt costs a Google Vision call per page plus OpenAI completions.
 * Each feature has its own limits ({@link AiFeatureLimits}) -- receipts counted in
 * pages, since pages are what cost money -- so heavy use of one
 * does not lock a caller out of another, and a refusal can say which limit it was.
 *
 * <p>For the length of an allowed request the caller is put in
 * {@link AiSpendContext}, so {@code AiSpendGuard} charges what the request spends
 * to them and can pause just them at their personal daily limit.
 */
@Component
public class AiRateLimitFilter extends OncePerRequestFilter {
    private static final String MECHANIC_SEARCH_TEMPLATE = "/api/mechanic-access/sessions/{sessionId}/history/search";

    /* Matched exactly, in this order, so the voice draft route does not swallow
       its two sub-routes. The explanation is a GET the record page makes on open
       and on every Regenerate -- the easiest endpoint in the product to run up a
       bill on by holding down a refresh key -- which is why it is here at all. */
    private static final Map<String, Feature> ROUTES = routes();

    private static Map<String, Feature> routes() {
        Map<String, Feature> routes = new LinkedHashMap<>();
        routes.put("/api/service-drafts/receipt", Feature.RECEIPT);
        routes.put("/api/service-drafts/voice/transcribe", Feature.VOICE_TRANSCRIBE);
        routes.put("/api/service-drafts/voice/translate", Feature.VOICE_TRANSLATE);
        routes.put("/api/service-drafts/voice", Feature.VOICE_DRAFT);
        routes.put("/api/service-records/*/ai-explanation", Feature.EXPLANATION);
        routes.put(MECHANIC_SEARCH_TEMPLATE, Feature.MECHANIC_SEARCH);
        return routes;
    }

    private final AntPathMatcher pathMatcher = new AntPathMatcher();
    private final AiRateLimiter rateLimiter;
    private final AiFeatureLimits featureLimits;
    private final SupabaseAuthService supabaseAuthService;
    private final MechanicAccessSessionRepository mechanicAccessSessionRepository;
    private final ObjectMapper objectMapper;
    private final AbuseMonitor abuseMonitor;

    public AiRateLimitFilter(
            AiRateLimiter rateLimiter,
            AiFeatureLimits featureLimits,
            SupabaseAuthService supabaseAuthService,
            MechanicAccessSessionRepository mechanicAccessSessionRepository,
            ObjectMapper objectMapper,
            AbuseMonitor abuseMonitor
    ) {
        this.abuseMonitor = abuseMonitor;
        this.rateLimiter = rateLimiter;
        this.featureLimits = featureLimits;
        this.supabaseAuthService = supabaseAuthService;
        this.mechanicAccessSessionRepository = mechanicAccessSessionRepository;
        this.objectMapper = objectMapper;
    }

    /* The caller whose bucket a request counts against, and whom its spend is charged to. */
    record Caller(String key, String spender) {
    }

    /*
     * Path match only. Identifying the caller resolves their token, and doing that
     * here would verify it twice on every guarded request.
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        /*
         * A browser sends a preflight before every one of these calls, so counting
         * them charged each upload twice -- and a preflight answered with 429 is
         * not reported as a rate limit at all, it surfaces as a CORS failure with
         * no explanation. A preflight costs nothing upstream; it never reaches
         * OpenAI.
         */
        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            return true;
        }
        String path = requestPath(request);
        return path == null || featureFor(path) == null;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String path = requestPath(request);
        Feature feature = path == null ? null : featureFor(path);
        if (feature == null) {
            filterChain.doFilter(request, response);
            return;
        }

        Caller caller;
        try {
            caller = callerFor(request, path, feature);
        } catch (AccountSuspendedException suspended) {
            // Refused before the upload is parsed or anything is paid for.
            writeError(response, HttpStatus.FORBIDDEN, suspended.getMessage(), AccountSuspendedException.CODE);
            return;
        }
        AiRateLimiter.Decision decision =
                rateLimiter.tryConsume(feature.key() + ":" + caller.key(), windowsFor(feature, request));
        if (!decision.allowed()) {
            /* The receipt screen does not send an upload that would not fit, so
               refusals on it come from something ignoring the answer. Enough of
               them earn a warning, a final warning, then suspension. */
            AbuseMonitor.Outcome outcome = feature == Feature.RECEIPT
                    ? abuseMonitor.recordRefusal(userIdOf(caller), feature.key())
                    : AbuseMonitor.Outcome.NONE;
            if (outcome == AbuseMonitor.Outcome.SUSPENDED) {
                writeError(response, HttpStatus.FORBIDDEN, abuseMonitor.suspensionMessage(),
                        AccountSuspendedException.CODE);
                return;
            }
            writeRefusal(response, feature, decision, outcome);
            return;
        }

        AiSpendContext.set(caller.spender());
        try {
            filterChain.doFilter(request, response);
        } finally {
            AiSpendContext.clear();
        }
    }

    /** The bucket a request counts against, or null when the endpoint does not spend money. */
    String rateLimitKey(HttpServletRequest request) {
        String path = requestPath(request);
        Feature feature = path == null ? null : featureFor(path);
        return feature == null ? null : feature.key() + ":" + callerFor(request, path, feature).key();
    }

    static final String MINUTE = "minute";
    static final String HOUR = "hour";
    static final String DAY = "day";

    private List<AiRateLimiter.Window> windowsFor(Feature feature, HttpServletRequest request) {
        if (feature == Feature.RECEIPT) {
            return ReceiptUploadAllowance.windows(featureLimits.receiptLimit(), receiptPageCount(request));
        }
        Limit limit = featureLimits.limitFor(feature);
        return List.of(
                new AiRateLimiter.Window(MINUTE, limit.perMinute(), Duration.ofMinutes(1), 1),
                new AiRateLimiter.Window(DAY, limit.perDay(), Duration.ofDays(1), 1));
    }

    /*
     * How many pages a receipt upload carries, from its multipart parts. Reading
     * the parts here parses the upload a little earlier than Spring would; the
     * container keeps the parsed parts, so the controller gets the same ones and
     * nothing is read twice. Anything unreadable -- not multipart, over the size
     * limit -- counts as one page and is left for the controller to refuse.
     */
    static long receiptPageCount(HttpServletRequest request) {
        String contentType = request.getContentType();
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).startsWith("multipart/")) {
            return 1;
        }
        try {
            long pages = 0;
            for (Part part : request.getParts()) {
                if ("receiptImages".equals(part.getName()) || "receiptImage".equals(part.getName())) {
                    pages++;
                }
            }
            return Math.max(1, pages);
        } catch (Exception unreadable) {
            return 1;
        }
    }

    private Feature featureFor(String path) {
        for (Map.Entry<String, Feature> route : ROUTES.entrySet()) {
            if (pathMatcher.match(route.getKey(), path)) {
                return route.getValue();
            }
        }
        return null;
    }

    private Caller callerFor(HttpServletRequest request, String path, Feature feature) {
        if (feature == Feature.MECHANIC_SEARCH) {
            String sessionId = pathMatcher.extractUriTemplateVariables(MECHANIC_SEARCH_TEMPLATE, path).get("sessionId");
            /* Keyed by the owner the session belongs to, and charged to them. Keyed by
               session, every approval was a fresh allowance: an owner could approve
               their own requests and search on as many sessions as they cared to
               make. A session nobody owns -- a guessed id -- keeps its own key. */
            return mechanicSessionOwner(sessionId)
                    .map(ownerId -> new Caller("owner:" + ownerId, "user:" + ownerId))
                    .orElseGet(() -> new Caller("session:" + sessionId, "session:" + sessionId));
        }
        String identity = callerIdentity(request);
        return new Caller(identity, identity);
    }

    private Optional<UUID> mechanicSessionOwner(String sessionId) {
        try {
            return mechanicAccessSessionRepository.findById(UUID.fromString(sessionId))
                    .map(MechanicAccessSession::getOwnerId);
        } catch (RuntimeException unresolvable) {
            // Not a UUID, or the lookup failed: limit it under its own key rather than not at all.
            return Optional.empty();
        }
    }

    private String requestPath(HttpServletRequest request) {
        String path = request.getServletPath();
        if (path == null || path.isBlank()) {
            path = request.getRequestURI();
        }
        return path == null || path.isBlank() ? null : path;
    }

    /*
     * Resolving the user here means the token is verified twice on these routes,
     * once by the filter and once by the service. With the JWT secret configured
     * that is an in-process signature check, which is nothing beside the
     * multi-second OpenAI call it is guarding.
     *
     * When the token cannot be resolved to a user we still want a stable key,
     * because a request that is about to be rejected can still be looped. The
     * token's hash is that key -- the raw token is a credential and never belongs
     * in a map key or a log line. With no token at all we fall back to the peer
     * address.
     */
    private String callerIdentity(HttpServletRequest request) {
        try {
            var user = supabaseAuthService.getCurrentUser(request);
            if (user.isPresent()) {
                return "user:" + user.get().userId();
            }
        } catch (AccountSuspendedException suspended) {
            throw suspended;
        } catch (RuntimeException exception) {
            // An unresolvable token is not a reason to skip limiting.
        }

        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && !header.isBlank()) {
            return "token:" + sha256(header);
        }
        return "ip:" + String.valueOf(request.getRemoteAddr());
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required to key rate limits.", exception);
        }
    }

    /* Says which limit was reached, because the right thing to do differs: wait a moment, or come back later. */
    String refusalMessage(Feature feature, String refusedBy, long retryAfterSeconds) {
        String wait = waitPhrase(retryAfterSeconds);
        if (feature == Feature.RECEIPT) {
            AiFeatureLimits.ReceiptLimit receipt = featureLimits.receiptLimit();
            if (DAY.equals(refusedBy)) {
                return "You've reached today's limit of " + receipt.pagesPerDay() + " receipt pages. "
                        + "You can upload more in " + wait + ", or type this record in now.";
            }
            if (HOUR.equals(refusedBy)) {
                return "You've reached this hour's limit of " + receipt.pagesPerHour() + " receipt pages. "
                        + "You can upload more in " + wait + ".";
            }
            return "That's a lot of receipt uploads in a short time. Wait " + wait + " and try again.";
        }
        if (DAY.equals(refusedBy)) {
            return "You've reached today's limit of " + featureLimits.limitFor(feature).perDay() + " "
                    + feature.plural() + ". You can try again in " + wait + ".";
        }
        return "That's a lot of " + feature.plural() + " in a short time. Wait " + wait + " and try again.";
    }

    static String waitPhrase(long seconds) {
        if (seconds < 90) {
            return seconds + (seconds == 1 ? " second" : " seconds");
        }
        long minutes = Math.round(seconds / 60.0);
        if (minutes < 90) {
            return "about " + minutes + " minutes";
        }
        long hours = Math.round(minutes / 60.0);
        return "about " + hours + (hours == 1 ? " hour" : " hours");
    }

    /* The signed-in account behind a caller, or null for a token or address nobody could resolve. */
    static UUID userIdOf(Caller caller) {
        String spender = caller.spender();
        if (spender == null || !spender.startsWith("user:")) {
            return null;
        }
        try {
            return UUID.fromString(spender.substring("user:".length()));
        } catch (IllegalArgumentException malformed) {
            return null;
        }
    }

    private void writeRefusal(
            HttpServletResponse response, Feature feature, AiRateLimiter.Decision decision, AbuseMonitor.Outcome outcome)
            throws IOException {
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(decision.retryAfterSeconds()));
        switch (outcome) {
            case WARNING -> writeError(response, HttpStatus.TOO_MANY_REQUESTS,
                    AbuseMonitor.WARNING_MESSAGE, AbuseMonitor.WARNING_CODE);
            case FINAL_WARNING -> writeError(response, HttpStatus.TOO_MANY_REQUESTS,
                    AbuseMonitor.FINAL_WARNING_MESSAGE, AbuseMonitor.FINAL_WARNING_CODE);
            default -> writeError(response, HttpStatus.TOO_MANY_REQUESTS,
                    refusalMessage(feature, decision.refusedBy(), decision.retryAfterSeconds()), "RATE_LIMITED");
        }
    }

    private void writeError(HttpServletResponse response, HttpStatus status, String message, String code)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getOutputStream(), ApiErrorResponse.of(message, status.value(), code));
    }
}
