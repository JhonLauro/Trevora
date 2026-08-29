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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import com.trevora.api.shared.http.OutboundHttp;
import org.springframework.web.multipart.MultipartFile;

@Service
public class VoiceTranscriptionService {
    private static final long MAX_AUDIO_BYTES = 25L * 1024L * 1024L;
    private static final String OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
    private static final String OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

    private final ObjectMapper objectMapper;
    private final VehicleService vehicleService;
    private final HttpClient httpClient;
    private final String openAiApiKey;
    private final String rawTranscriptionModel;
    private final String textTranslationModel;

    public VoiceTranscriptionService(
            ObjectMapper objectMapper,
            VehicleService vehicleService,
            @Value("${trevora.ai.openai.api-key:}") String openAiApiKey,
            @Value("${trevora.voice.openai.raw-transcription-model:gpt-4o-mini-transcribe}") String rawTranscriptionModel,
            @Value("${trevora.voice.openai.text-translation-model:gpt-4o}") String textTranslationModel
    ) {
        this.objectMapper = objectMapper;
        this.vehicleService = vehicleService;
        this.httpClient = OutboundHttp.httpClient();
        this.openAiApiKey = openAiApiKey == null ? "" : openAiApiKey.trim();
        this.rawTranscriptionModel = rawTranscriptionModel == null || rawTranscriptionModel.isBlank()
                ? "gpt-4o-mini-transcribe"
                : rawTranscriptionModel.trim();
        this.textTranslationModel = textTranslationModel == null || textTranslationModel.isBlank()
                ? "gpt-4o"
                : textTranslationModel.trim();
    }

    public VoiceTranscriptionResponse transcribe(UUID vehicleId, MultipartFile audioFile) {
        vehicleService.verifyVehicleBelongsToCurrentUser(vehicleId);
        validateAudio(audioFile);

        if (openAiApiKey.isBlank()) {
            throw new VoiceTranscriptionException("Speech transcription is not configured. Set OPENAI_API_KEY before starting the backend.");
        }

        String transcript = transcribeAudio(audioFile);
        if (transcript.isBlank()) {
            throw new VoiceTranscriptionException("OpenAI returned an empty transcript. Try recording a clearer voice note.");
        }

        return new VoiceTranscriptionResponse(transcript, transcript, "openai", rawTranscriptionModel, false);
    }

    public VoiceTranscriptionResponse translate(VoiceTranslationRequest request) {
        vehicleService.verifyVehicleBelongsToCurrentUser(request.vehicleId());
        String sourceTranscript = request.transcript() == null ? "" : request.transcript().trim();

        if (sourceTranscript.isBlank()) {
            throw new VoiceTranscriptionException("Transcript is required before translation.");
        }
        if (openAiApiKey.isBlank()) {
            throw new VoiceTranscriptionException("Speech translation is not configured. Set OPENAI_API_KEY before starting the backend.");
        }

        String translatedTranscript = translateTranscriptToEnglish(sourceTranscript);
        if (translatedTranscript.isBlank()) {
            throw new VoiceTranscriptionException("OpenAI returned an empty translation. Try again or edit the transcript manually.");
        }

        return new VoiceTranscriptionResponse(
                translatedTranscript,
                sourceTranscript,
                "openai",
                textTranslationModel,
                true
        );
    }

    private void validateAudio(MultipartFile audioFile) {
        if (audioFile == null || audioFile.isEmpty()) {
            throw new VoiceTranscriptionException("Audio recording is required.");
        }
        if (audioFile.getSize() > MAX_AUDIO_BYTES) {
            throw new VoiceTranscriptionException("Audio recording is too large. Recordings must be 25 MB or smaller.");
        }
    }

    private String transcribeAudio(MultipartFile audioFile) {
        String boundary = "----TrevoraVoiceBoundary" + UUID.randomUUID();

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(OPENAI_TRANSCRIPTIONS_URL))
                    .header("Authorization", "Bearer " + openAiApiKey)
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .timeout(OutboundHttp.TRANSCRIPTION_READ_TIMEOUT)
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

    private String translateTranscriptToEnglish(String sourceTranscript) {
        try {
            Map<String, Object> requestBody = new LinkedHashMap<>();
            requestBody.put("model", textTranslationModel);
            requestBody.put("temperature", 0);
            requestBody.put("response_format", Map.of("type", "json_object"));
            requestBody.put("messages", List.of(
                    Map.of(
                            "role", "system",
                            "content", translationSystemPrompt()
                    ),
                    Map.of(
                            "role", "user",
                            "content", "Transcript to translate:\n" + sourceTranscript
                    )
            ));

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(OPENAI_CHAT_COMPLETIONS_URL))
                    .header("Authorization", "Bearer " + openAiApiKey)
                    .header("Content-Type", "application/json")
                    .timeout(OutboundHttp.OPENAI_READ_TIMEOUT)
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody)))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new VoiceTranscriptionException(errorMessage(response.body(), "translation"));
            }

            JsonNode body = objectMapper.readTree(response.body());
            String content = body.path("choices").path(0).path("message").path("content").asText("");
            if (content.isBlank()) {
                throw new VoiceTranscriptionException("OpenAI translation returned no content.");
            }

            JsonNode translated = objectMapper.readTree(stripMarkdownFence(content));
            return translated.path("englishTranscript").asText("").trim();
        } catch (IOException exception) {
            throw new VoiceTranscriptionException("Unable to translate the voice transcript.", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new VoiceTranscriptionException("Voice transcript translation was interrupted.", exception);
        }
    }

    private List<byte[]> multipartBody(String boundary, MultipartFile audioFile) throws IOException {
        List<byte[]> body = new ArrayList<>();
        addFormField(body, boundary, "model", rawTranscriptionModel);
        addFormField(body, boundary, "response_format", "json");
        addFormField(body, boundary, "prompt", "Transcribe the spoken words in their original spoken language. Do not translate to English. Preserve mixed-language speech as spoken.");
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

    private String translationSystemPrompt() {
        return """
                You are a translation engine for Trevora voice service notes.
                Translate the user's transcript into natural English.
                Preserve vehicle service facts exactly: dates, costs, numbers, shop names, vehicle names, parts, and remarks.
                If the transcript is already English, return it unchanged.
                Do not summarize, add, remove, or infer any service details.
                Return strict JSON only with this exact shape:
                {"englishTranscript":"...","alreadyEnglish":true}
                """;
    }

    private String stripMarkdownFence(String value) {
        String trimmed = value.trim();
        if (!trimmed.startsWith("```")) {
            return trimmed;
        }
        int firstNewline = trimmed.indexOf('\n');
        int lastFence = trimmed.lastIndexOf("```");
        if (firstNewline >= 0 && lastFence > firstNewline) {
            return trimmed.substring(firstNewline + 1, lastFence).trim();
        }
        return trimmed;
    }

    private String errorMessage(String responseBody) {
        return errorMessage(responseBody, "transcription");
    }

    private String errorMessage(String responseBody, String operation) {
        try {
            JsonNode error = objectMapper.readTree(responseBody).path("error");
            String message = error.path("message").asText("");
            if (!message.isBlank()) {
                return "OpenAI " + operation + " failed: " + message;
            }
        } catch (IOException ignored) {
            // Fall through to generic message.
        }
        return "OpenAI " + operation + " failed. Try again with a shorter or clearer recording.";
    }
}
