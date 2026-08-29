package com.trevora.api.shared.http;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;

/**
 * The point of these clients is that they give up. A provider that accepts the
 * connection and then says nothing is the case that used to hold a request
 * thread forever, so it is the case worth actually reproducing rather than
 * asserting a setter was called.
 */
class OutboundHttpTimeoutTest {

    /** Accepts one connection and never answers, like a stalled provider. */
    private static ServerSocket silentServer() throws IOException {
        ServerSocket server = new ServerSocket(0);
        Thread accepter = new Thread(() -> {
            try (Socket ignored = server.accept()) {
                Thread.sleep(30_000);
            } catch (IOException | InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        });
        accepter.setDaemon(true);
        accepter.start();
        return server;
    }

    @Test
    @DisplayName("a stalled provider fails on the read timeout instead of hanging")
    void readTimeoutFires() throws IOException {
        try (ServerSocket server = silentServer()) {
            var client = OutboundHttp.restClient(Duration.ofMillis(400));
            long startedAt = System.nanoTime();

            assertThrows(ResourceAccessException.class, () -> client.get()
                    .uri("http://127.0.0.1:" + server.getLocalPort() + "/stall")
                    .retrieve()
                    .body(String.class));

            Duration waited = Duration.ofNanos(System.nanoTime() - startedAt);
            assertTrue(waited.toSeconds() < 10, "gave up after " + waited.toMillis() + "ms, which is not giving up");
        }
    }

    @Test
    @DisplayName("the configured timeouts are ordered by how long the work legitimately takes")
    void timeoutsAreOrdered() {
        assertTrue(OutboundHttp.CONNECT_TIMEOUT.toSeconds() > 0);
        assertTrue(OutboundHttp.VISION_READ_TIMEOUT.compareTo(OutboundHttp.CONNECT_TIMEOUT) > 0);
        assertTrue(
                OutboundHttp.TRANSCRIPTION_READ_TIMEOUT.compareTo(OutboundHttp.OPENAI_READ_TIMEOUT) > 0,
                "uploading and transcribing audio takes longer than one chat completion"
        );
    }

    @Test
    @DisplayName("the java.net client carries a connect timeout")
    void javaClientHasConnectTimeout() {
        var client = OutboundHttp.httpClient();

        assertNotNull(client);
        assertTrue(client.connectTimeout().isPresent(), "an absent connect timeout means waiting forever");
    }
}
