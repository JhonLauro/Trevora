package com.trevora.api.shared.ratelimit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.AccountStandingService;
import com.trevora.api.features.auth.SupabaseAuthService;
import com.trevora.api.features.auth.SupabaseAuthenticatedUser;
import com.trevora.api.features.auth.UserRole;
import java.time.Clock;
import java.time.Duration;
import com.trevora.api.features.mechanicaccess.MechanicAccessSession;
import com.trevora.api.features.mechanicaccess.MechanicAccessSessionRepository;
import com.trevora.api.shared.aibudget.AiSpendContext;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletResponse;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockMultipartHttpServletRequest;
import org.springframework.mock.web.MockPart;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Which requests the limiter charges for. The preflight case is here because
 * it was got wrong once: browsers send an OPTIONS before every one of these
 * calls, so counting them charged each upload twice, and a preflight answered
 * with 429 does not reach the page as a rate limit at all -- it surfaces as a
 * CORS failure with nothing explaining it.
 */
class AiRateLimitFilterTest {

    private final MechanicAccessSessionRepository sessions = mock(MechanicAccessSessionRepository.class);

    private final AiRateLimitFilter filter = new AiRateLimitFilter(
            new AiRateLimiter(new AiRateLimitProperties(true, 10, 100, 10_000)),
            // Small page budgets (30 an hour, 100 a day) so the tests can reach them.
            new AiFeatureLimits(10, 30, 100, 5, 40, 20, 200, 10, 100),
            mock(SupabaseAuthService.class),
            sessions,
            new ObjectMapper().findAndRegisterModules(),
            AbuseMonitor.disabled());

    private MockHttpServletResponse send(String method, String path) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setServletPath(path);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }

    private MockHttpServletResponse uploadReceipt(int pages) throws Exception {
        String path = "/api/service-drafts/receipt";
        MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
        request.setRequestURI(path);
        request.setServletPath(path);
        request.setContentType("multipart/form-data; boundary=test");
        for (int page = 0; page < pages; page++) {
            request.addPart(new MockPart("receiptImages", "page" + page + ".jpg", new byte[] {1, 2, 3}));
        }
        request.addPart(new MockPart("vehicleId", UUID.randomUUID().toString().getBytes()));
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }

    @Test
    @DisplayName("several long receipts in a row go through: a nine-page casa document is not three uploads too many")
    void longReceiptsBackToBackAreAllowed() throws Exception {
        // Three nine-page documents, one after another: 27 pages, under the 30-an-hour budget.
        for (int document = 1; document <= 3; document++) {
            assertEquals(200, uploadReceipt(9).getStatus(), "document " + document);
        }
    }

    @Test
    @DisplayName("receipts are limited by pages, and the refusal says it was the hourly page budget")
    void receiptPagesAreBudgetedPerHour() throws Exception {
        for (int document = 1; document <= 3; document++) {
            uploadReceipt(10); // 30 pages: the hour is used
        }
        MockHttpServletResponse refused = uploadReceipt(3);

        assertEquals(429, refused.getStatus());
        assertTrue(refused.getContentAsString().contains("this hour's limit of 30 receipt pages"), refused.getContentAsString());

        // The same caller can still open an explanation: that feature has its own bucket.
        assertEquals(200, send("GET", "/api/service-records/" + UUID.randomUUID() + "/ai-explanation").getStatus());
    }

    @Test
    @DisplayName("hammering the upload button is stopped even with one-page uploads")
    void hammeringIsStopped() throws Exception {
        for (int upload = 1; upload <= 10; upload++) {
            assertEquals(200, uploadReceipt(1).getStatus(), "upload " + upload); // 10 pages, well inside the hour
        }
        MockHttpServletResponse refused = uploadReceipt(1);

        assertEquals(429, refused.getStatus());
        assertTrue(refused.getContentAsString().contains("receipt uploads in a short time"), refused.getContentAsString());
    }

    @Test
    @DisplayName("an upload's pages are counted from its image parts only")
    void pagesAreCountedFromImageParts() throws Exception {
        MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
        request.setContentType("multipart/form-data; boundary=test");
        request.addPart(new MockPart("receiptImages", "a.jpg", new byte[] {1}));
        request.addPart(new MockPart("receiptImages", "b.jpg", new byte[] {1}));
        request.addPart(new MockPart("receiptPagesJson", "[]".getBytes()));

        assertEquals(2, AiRateLimitFilter.receiptPageCount(request));
        assertEquals(1, AiRateLimitFilter.receiptPageCount(new MockHttpServletRequest("POST", "/api/service-drafts/receipt")));
    }

    @Test
    @DisplayName("each paid feature, including each voice step, counts in its own bucket")
    void featuresAreKeyedSeparately() {
        assertTrue(keyFor("/api/service-drafts/receipt").startsWith("receipt:"));
        assertTrue(keyFor("/api/service-drafts/voice/transcribe").startsWith("voice-transcribe:"));
        assertTrue(keyFor("/api/service-drafts/voice/translate").startsWith("voice-translate:"));
        assertTrue(keyFor("/api/service-drafts/voice").startsWith("voice-draft:"));
        assertTrue(keyFor("/api/service-records/" + UUID.randomUUID() + "/ai-explanation").startsWith("explanation:"));
    }

    @Test
    @DisplayName("the shipped receipt limits are 100 pages an hour and 350 a day")
    void shippedReceiptLimits() {
        AiFeatureLimits.ReceiptLimit shipped = AiFeatureLimits.defaults().receiptLimit();

        assertEquals(10, shipped.uploadsPerMinute());
        assertEquals(100, shipped.pagesPerHour());
        assertEquals(350, shipped.pagesPerDay());
    }

    @Test
    @DisplayName("each refusal says which limit was reached and how long to wait")
    void refusalMessagesSayWhichLimit() {
        AiFeatureLimits.Feature receipt = AiFeatureLimits.Feature.RECEIPT;

        assertTrue(filter.refusalMessage(receipt, AiRateLimitFilter.MINUTE, 20).contains("Wait 20 seconds"));
        assertTrue(filter.refusalMessage(receipt, AiRateLimitFilter.HOUR, 540).contains("about 9 minutes"));
        assertTrue(filter.refusalMessage(receipt, AiRateLimitFilter.DAY, 14_400)
                .contains("today's limit of 100 receipt pages"));
        assertTrue(filter.refusalMessage(AiFeatureLimits.Feature.EXPLANATION, AiRateLimitFilter.DAY, 14_400)
                .contains("today's limit of 200 explanations"));
    }

    @Test
    @DisplayName("while a paid request runs the spend guard knows who it is for, and forgets afterwards")
    void spendContextCoversTheRequestOnly() throws Exception {
        String path = "/api/service-drafts/receipt";
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        request.setServletPath(path);
        String[] seen = new String[1];

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> seen[0] = AiSpendContext.current());

        assertEquals("ip:127.0.0.1", seen[0]);
        assertEquals("unattributed", AiSpendContext.current());
    }

    @Test
    @DisplayName("an account that keeps sending refused receipt uploads is warned, warned again, then suspended")
    void spammingTheReceiptReaderEscalates() throws Exception {
        UUID ownerId = UUID.randomUUID();
        SupabaseAuthService auth = mock(SupabaseAuthService.class);
        when(auth.getCurrentUser(org.mockito.ArgumentMatchers.any())).thenReturn(Optional.of(
                new SupabaseAuthenticatedUser(ownerId, "bot@example.com", "Bot", "", UserRole.VEHICLE_OWNER)));
        AccountStandingService standing = AccountStandingService.inMemory();
        // One upload a minute; two refusals make a strike; no spacing between strikes.
        AiRateLimitFilter strict = new AiRateLimitFilter(
                new AiRateLimiter(new AiRateLimitProperties(true, 10, 100, 10_000)),
                new AiFeatureLimits(1, 100, 350, 5, 40, 20, 200, 10, 100),
                auth,
                sessions,
                new ObjectMapper().findAndRegisterModules(),
                new AbuseMonitor(true, 2, Duration.ofMinutes(10), Duration.ZERO, Duration.ofDays(30),
                        standing, message -> { }, Clock.systemUTC()));

        java.util.function.Supplier<MockHttpServletResponse> upload = () -> {
            try {
                String path = "/api/service-drafts/receipt";
                MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
                request.setRequestURI(path);
                request.setServletPath(path);
                request.setContentType("multipart/form-data; boundary=test");
                request.addPart(new MockPart("receiptImages", "page.jpg", new byte[] {1}));
                MockHttpServletResponse response = new MockHttpServletResponse();
                strict.doFilter(request, response, new MockFilterChain());
                return response;
            } catch (Exception failure) {
                throw new IllegalStateException(failure);
            }
        };

        assertEquals(200, upload.get().getStatus());
        assertTrue(upload.get().getContentAsString().contains("\"code\":\"RATE_LIMITED\""));
        MockHttpServletResponse warned = upload.get();
        assertEquals(429, warned.getStatus());
        assertTrue(warned.getContentAsString().contains("\"code\":\"ABUSE_WARNING\""), warned.getContentAsString());
        upload.get();
        MockHttpServletResponse finalWarning = upload.get();
        assertTrue(finalWarning.getContentAsString().contains("\"code\":\"ABUSE_FINAL_WARNING\""),
                finalWarning.getContentAsString());
        upload.get();
        MockHttpServletResponse suspended = upload.get();

        assertEquals(403, suspended.getStatus());
        assertTrue(suspended.getContentAsString().contains("\"code\":\"ACCOUNT_SUSPENDED\""),
                suspended.getContentAsString());
        assertTrue(standing.suspension(ownerId).isPresent());
    }

    private String keyFor(String path) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.setServletPath(path);
        return (String) ReflectionTestUtils.invokeMethod(filter, "rateLimitKey", request);
    }

    /* Keyed by session, every approval was a new allowance, and an owner can
       approve their own requests as often as they like. */
    @Test
    @DisplayName("mechanic search is limited per owner, so new sessions are not new allowances")
    void mechanicSearchIsKeyedByOwner() {
        UUID ownerId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        MechanicAccessSession session = new MechanicAccessSession();
        session.setOwnerId(ownerId);
        when(sessions.findById(sessionId)).thenReturn(Optional.of(session));

        assertEquals("mechanic-search:owner:" + ownerId,
                keyFor("/api/mechanic-access/sessions/" + sessionId + "/history/search"));
    }

    @Test
    @DisplayName("a search on a session that does not exist is still limited, under its own key")
    void unknownSessionKeepsItsOwnKey() {
        UUID sessionId = UUID.randomUUID();
        when(sessions.findById(sessionId)).thenReturn(Optional.empty());

        assertEquals("mechanic-search:session:" + sessionId, keyFor("/api/mechanic-access/sessions/" + sessionId + "/history/search"));
        assertEquals("mechanic-search:session:not-a-uuid", keyFor("/api/mechanic-access/sessions/not-a-uuid/history/search"));
    }

    private boolean skipped(String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setServletPath(path);
        return (boolean) ReflectionTestUtils.invokeMethod(filter, "shouldNotFilter", request);
    }

    @Test
    @DisplayName("a CORS preflight is never charged")
    void preflightIsNotCharged() {
        assertTrue(skipped("OPTIONS", "/api/service-drafts/receipt"));
        assertTrue(skipped("OPTIONS", "/api/mechanic-access/sessions/abc/history/search"));
    }

    @Test
    @DisplayName("the calls that spend money are charged")
    void paidEndpointsAreCharged() {
        assertFalse(skipped("POST", "/api/service-drafts/receipt"));
        assertFalse(skipped("POST", "/api/service-drafts/voice"));
        assertFalse(skipped("POST", "/api/service-drafts/voice/transcribe"));
        assertFalse(skipped("POST", "/api/service-drafts/voice/translate"));
        assertFalse(skipped("GET", "/api/mechanic-access/sessions/abc/history/search"));
    }

    @Test
    @DisplayName("endpoints that cost only a database query are not charged")
    void freeEndpointsAreNotCharged() {
        assertTrue(skipped("GET", "/api/vehicles"));
        assertTrue(skipped("GET", "/api/garage"));
        assertTrue(skipped("GET", "/api/auth/me"));
        // Reading shared history is free; only searching it reaches a model.
        assertTrue(skipped("GET", "/api/mechanic-access/sessions/abc/history"));
        assertTrue(skipped("POST", "/api/service-drafts/manual"));
    }
}
