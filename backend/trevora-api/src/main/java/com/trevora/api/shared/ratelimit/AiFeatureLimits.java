package com.trevora.api.shared.ratelimit;

import java.util.EnumMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * How often each caller may use each paid AI feature.
 *
 * <p>One shared count used to cover everything, so an explanation cost a caller the
 * same as a ten-page receipt, and a limit loose enough for one was either useless
 * or crippling for the other. Each feature now has its own limits, sized to what
 * the feature costs and how often a real owner uses it. Normal use should never
 * meet them.
 *
 * <p><b>Receipts are counted in pages, not uploads,</b> because pages are what cost
 * money -- one Google Vision call each -- and because real paperwork varies: a
 * casa service can hand over nine pages at once, and an owner catching up can
 * upload several receipts back to back. Counting uploads either blocked that or
 * let a bot send ten-page uploads all day. So a receipt upload spends:
 * <ul>
 *   <li>one upload from a per-minute count, which only stops hammering -- a real
 *       upload takes long enough to read that no person reaches it;</li>
 *   <li>its pages from an hourly page budget, which comes back whole when the
 *       hour ends -- the receipt screen shows what is used and when that is
 *       ({@link ReceiptUploadAllowance});</li>
 *   <li>its pages from a daily page budget, which stops a slow drip.</li>
 * </ul>
 *
 * <p>The three voice endpoints each have their own bucket at the voice limits, so
 * one voice note -- transcribe, perhaps translate, then save -- spends one call
 * from each rather than three from one.
 *
 * <p>Behind all of these sits the per-caller daily spend limit in
 * {@code AiSpendGuard}, which holds whatever these are set to.
 *
 * <p>All values are environment variables; see {@code application.properties}.
 */
@Component
public class AiFeatureLimits {

    public enum Feature {
        RECEIPT("receipt", "receipt uploads"),
        VOICE_TRANSCRIBE("voice-transcribe", "voice notes"),
        VOICE_TRANSLATE("voice-translate", "translations"),
        VOICE_DRAFT("voice-draft", "voice records"),
        EXPLANATION("explanation", "explanations"),
        MECHANIC_SEARCH("mechanic-search", "AI searches");

        private final String key;
        private final String plural;

        Feature(String key, String plural) {
            this.key = key;
            this.plural = plural;
        }

        /** The prefix of this feature's rate-limit buckets. */
        public String key() {
            return key;
        }

        /** How a person would name a count of these, for the refusal message. */
        public String plural() {
            return plural;
        }
    }

    /** Calls per minute and per day, for every feature except receipts. */
    public record Limit(int perMinute, int perDay) {
    }

    /** Receipt uploads per minute, and receipt pages per hour and per day. */
    public record ReceiptLimit(int uploadsPerMinute, int pagesPerHour, int pagesPerDay) {
    }

    private final Map<Feature, Limit> limits = new EnumMap<>(Feature.class);
    private final ReceiptLimit receiptLimit;

    public AiFeatureLimits(
            @Value("${trevora.ai.limit.receipt.uploads-per-minute:10}") int receiptUploadsPerMinute,
            @Value("${trevora.ai.limit.receipt.pages-per-hour:100}") int receiptPagesPerHour,
            @Value("${trevora.ai.limit.receipt.pages-per-day:350}") int receiptPagesPerDay,
            @Value("${trevora.ai.limit.voice.per-minute:5}") int voicePerMinute,
            @Value("${trevora.ai.limit.voice.per-day:40}") int voicePerDay,
            @Value("${trevora.ai.limit.explanation.per-minute:20}") int explanationPerMinute,
            @Value("${trevora.ai.limit.explanation.per-day:200}") int explanationPerDay,
            @Value("${trevora.ai.limit.mechanic-search.per-minute:10}") int searchPerMinute,
            @Value("${trevora.ai.limit.mechanic-search.per-day:100}") int searchPerDay
    ) {
        this.receiptLimit = new ReceiptLimit(
                Math.max(1, receiptUploadsPerMinute), Math.max(1, receiptPagesPerHour), Math.max(1, receiptPagesPerDay));
        Limit voice = limit(voicePerMinute, voicePerDay);
        limits.put(Feature.VOICE_TRANSCRIBE, voice);
        limits.put(Feature.VOICE_TRANSLATE, voice);
        limits.put(Feature.VOICE_DRAFT, voice);
        limits.put(Feature.EXPLANATION, limit(explanationPerMinute, explanationPerDay));
        limits.put(Feature.MECHANIC_SEARCH, limit(searchPerMinute, searchPerDay));
    }

    /** The shipped defaults, for code built outside Spring. */
    public static AiFeatureLimits defaults() {
        return new AiFeatureLimits(10, 100, 350, 5, 40, 20, 200, 10, 100);
    }

    private static Limit limit(int perMinute, int perDay) {
        return new Limit(Math.max(1, perMinute), Math.max(1, perDay));
    }

    /** Limits for every feature except {@link Feature#RECEIPT}; see {@link #receiptLimit()}. */
    public Limit limitFor(Feature feature) {
        return limits.get(feature);
    }

    public ReceiptLimit receiptLimit() {
        return receiptLimit;
    }
}
