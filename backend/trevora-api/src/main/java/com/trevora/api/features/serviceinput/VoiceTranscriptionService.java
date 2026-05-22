package com.trevora.api.features.serviceinput;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.vehicle.VehicleService;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class VoiceTranscriptionService {
    private static final long MAX_AUDIO_BYTES = 25L * 1024L * 1024L;
    private static final String OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

    private final ObjectMapper objectMapper;
    private final VehicleService vehicleService;
    private final HttpClient httpClient;
    private final String openAiApiKey;
    private final String transcriptionModel;

    public VoiceTranscriptionService(
            ObjectMapper objectMapper,
            VehicleService vehicleService,
            @Value("${trevora.ai.openai.api-key:}") String openAiApiKey,
            @Value("${trevora.voice.openai.transcription-model:gpt-4o-mini-transcribe}") String transcriptionModel
    ) {
        this.objectMapper = objectMapper;
        this.vehicleService = vehicleService;
        this.httpClient = HttpClient.newHttpClient();
        this.openAiApiKey = openAiApiKey == null ? "" : openAiApiKey.trim();
        this.transcriptionModel = transcriptionModel == null || transcriptionModel.isBlank()
                ? "gpt-4o-mini-transcribe"
                : transcriptionModel.trim();
    }

    public VoiceTranscriptionResponse transcribe(UUID vehicleId, MultipartFile audioFile) {
        vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId);
        validateAudio(audioFile);

        if (openAiApiKey.isBlank()) {
            throw new VoiceTranscriptionException("Speech transcription is not configured. Set OPENAI_API_KEY before starting the backend.");
        }

        String transcript = callOpenAi(audioFile);
        if (transcript.isBlank()) {
            throw new VoiceTranscriptionException("OpenAI returned an empty transcript. Try recording a clearer voice note.");
        }

        return new VoiceTranscriptionResponse(transcript, "openai", transcriptionModel);
    }

    private void validateAudio(MultipartFile audioFile) {
        if (audioFile == null || audioFile.isEmpty()) {
            throw new VoiceTranscriptionException("Audio recording is required.");
        }
        if (audioFile.getSize() > MAX_AUDIO_BYTES) {
            throw new VoiceTranscriptionException("Audio recording is too large. Recordings must be 25 MB or smaller.");
        }
    }

    private String callOpenAi(MultipartFile audioFile) {
        String boundary = "----TrevoraVoiceBoundary" + UUID.randomUUID();

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(OPENAI_TRANSCRIPTIONS_URL))
                    .header("Authorization", "Bearer " + openAiApiKey)
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArrays(multipartBody(boundary, audioFile)))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new VoiceTranscriptionException(errorMessage(response.body()));
            }

            JsonNode body = objectMapper.readTree(response.body());
            return body.path("text").asText("").trim();
        } catch (IOException exception) {
            throw new VoiceTranscriptionException("Unable to transcribe the voice recording.", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new VoiceTranscriptionException("Voice transcription was interrupted.", exception);
        }
    }

    private List<byte[]> multipartBody(String boundary, MultipartFile audioFile) throws IOException {
        List<byte[]> body = new ArrayList<>();
        addFormField(body, boundary, "model", transcriptionModel);
        addFormField(body, boundary, "response_format", "json");
        addFileField(body, boundary, audioFile);
        body.add(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return body;
    }

    private void addFormField(List<byte[]> body, String boundary, String name, String value) {
        body.add(("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n"
                + value + "\r\n").getBytes(StandardCharsets.UTF_8));
    }

    private void addFileField(List<byte[]> body, String boundary, MultipartFile audioFile) throws IOException {
        String filename = safeFilename(audioFile.getOriginalFilename());
        String contentType = audioFile.getContentType() == null || audioFile.getContentType().isBlank()
                ? "audio/webm"
                : audioFile.getContentType();

        body.add(("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\n"
                + "Content-Type: " + contentType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.add(audioFile.getBytes());
        body.add("\r\n".getBytes(StandardCharsets.UTF_8));
    }

    private String safeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "voice-recording.webm";
        }
        return filename.replaceAll("[\\r\\n\"\\\\]", "_");
    }

    private String errorMessage(String responseBody) {
        try {
            JsonNode error = objectMapper.readTree(responseBody).path("error");
            String message = error.path("message").asText("");
            if (!message.isBlank()) {
                return "OpenAI transcription failed: " + message;
            }
        } catch (IOException ignored) {
            // Fall through to generic message.
        }
        return "OpenAI transcription failed. Try again with a shorter or clearer recording.";
    }
}
