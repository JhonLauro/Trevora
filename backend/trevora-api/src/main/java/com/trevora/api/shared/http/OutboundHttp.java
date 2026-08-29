package com.trevora.api.shared.http;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.web.client.RestClient;

/**
 * Clients for the third-party APIs we call, built with timeouts.
 *
 * <p>Both {@code RestClient.create()} and {@code HttpClient.newHttpClient()}
 * default to waiting forever for a response. Every one of those calls happens
 * on a request thread, so a provider that accepts a connection and then stalls
 * does not just make one upload slow -- it holds a Tomcat worker until someone
 * restarts the process. At the 200-thread default it takes remarkably few
 * stalled calls to stop serving anything at all, including the pages that
 * never touch OpenAI.
 *
 * <p>The read timeouts differ by what is on the other end, because the honest
 * upper bound differs: reading a receipt is a couple of seconds, transcribing
 * audio is proportional to its length. They are generous on purpose -- this is
 * a backstop against a hung connection, not a latency target, and cutting off
 * a call that was about to succeed costs the owner the extraction.
 */
public final class OutboundHttp {
    /** Establishing a TCP connection to a healthy provider is fast or not happening. */
    public static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    /** Google Vision OCR on a single receipt page. */
    public static final Duration VISION_READ_TIMEOUT = Duration.ofSeconds(30);
    /** An OpenAI chat completion: extraction, mechanic search, transcript translation. */
    public static final Duration OPENAI_READ_TIMEOUT = Duration.ofSeconds(60);
    /** Audio transcription, which uploads the recording before any work starts. */
    public static final Duration TRANSCRIPTION_READ_TIMEOUT = Duration.ofSeconds(120);

    private OutboundHttp() {
    }

    /*
     * Built through Boot's factory rather than by picking an implementation
     * here. RestClient.create() selects its HTTP client by what is on the
     * classpath; naming a concrete factory to get at its timeout setters would
     * quietly swap that choice for a different one, which is a bigger change
     * than the one intended. This adds the timeouts and leaves the selection
     * where it was.
     */
    public static RestClient restClient(Duration readTimeout) {
        return RestClient.builder()
                .requestFactory(ClientHttpRequestFactories.get(
                        ClientHttpRequestFactorySettings.DEFAULTS
                                .withConnectTimeout(CONNECT_TIMEOUT)
                                .withReadTimeout(readTimeout)))
                .build();
    }

    /**
     * The connect timeout is all that can be set on the client itself; the
     * response timeout belongs on each request, so callers must also set
     * {@code .timeout(...)} on the builder.
     */
    public static HttpClient httpClient() {
        return HttpClient.newBuilder()
                .connectTimeout(CONNECT_TIMEOUT)
                .build();
    }
}
