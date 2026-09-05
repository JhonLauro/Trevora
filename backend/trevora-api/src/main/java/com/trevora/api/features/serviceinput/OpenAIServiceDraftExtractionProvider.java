package com.trevora.api.features.serviceinput;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.trevora.api.shared.http.OutboundHttp;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Service
public class OpenAIServiceDraftExtractionProvider {
    private static final String OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
    private static final int MAX_OCR_CHARS = 12000;
    private static final int MAX_VOICE_TRANSCRIPT_CHARS = 8000;
    /**
     * Attempts per extraction, retries included. A rate limit or a timeout used
     * to drop straight to the raw-OCR fallback, which costs the owner every
     * extracted field over a condition that clears in a second. Three is enough
     * to ride out a burst and few enough that a real outage still fails while
     * someone is waiting on the response.
     */
    private static final int MAX_ATTEMPTS = 3;
    private static final long RETRY_BASE_BACKOFF_MILLIS = 500L;
    /**
     * Longest {@code Retry-After} we will sit through. When the provider asks
     * for longer than this it is not describing a blip, and someone is waiting
     * on this request: falling back to the raw OCR text now beats holding the
     * thread for a minute and very possibly failing anyway.
     */
    private static final long MAX_HONORED_RETRY_AFTER_MILLIS = 10_000L;
    /**
     * Ceiling on the generated answer. Left unset the model may spend its whole
     * output window repeating array entries before anyone finds out, and the
     * bill and the wait are the owner's either way.
     *
     * <p>Raised from 8000 on evidence. A Toyota service invoice failed every
     * attempt on three separate golden runs with {@code completion 8000, cap
     * 8000} - the answer stopped exactly at the ceiling, mid-JSON, so the body
     * was valid JSON's opening half and the whole extraction fell back to raw
     * OCR text. It read as an unexplained intermittent failure for most of a
     * day because the retry loop reported "a response that could not be read"
     * and dropped the explanation that named the cap.
     *
     * <p>The prompt is now around 6,500 tokens of input on a long receipt, and
     * a densely itemised invoice answers with a line entry per printed row.
     * 12000 leaves real headroom for both without abandoning the ceiling: a
     * model that spirals on a repeated entry still stops, it just stops after
     * the honest answers have had room to finish.
     */
    private static final int MAX_COMPLETION_TOKENS = 12000;
    /**
     * Kilometres past which a reading is a misread rather than a high mileage.
     * Deliberately generous - a well-used jeepney can pass a million km, and the
     * point is to catch an order of magnitude, not to argue about a plausible one.
     */
    private static final int MAX_PLAUSIBLE_ODOMETER_KM = 2_000_000;
    /** Pesos of slack before a lines-versus-total gap is worth reporting: VAT rounding. */
    private static final BigDecimal RECONCILE_TOLERANCE = new BigDecimal("1.00");

    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final String apiKey;
    private final String model;

    /**
     * @implNote {@code @Autowired} is required, not decorative. There are two
     *     constructors, and with no annotation Spring will not choose between
     *     them: it looks for a no-arg constructor instead and fails to start
     *     the whole context.
     */
    @Autowired
    public OpenAIServiceDraftExtractionProvider(
            ObjectMapper objectMapper,
            @Value("${trevora.ai.openai.api-key:}") String apiKey,
            @Value("${trevora.ai.openai.model:gpt-4o-mini}") String model
    ) {
        this(objectMapper, OutboundHttp.restClient(OutboundHttp.EXTRACTION_READ_TIMEOUT), apiKey, model);
    }

    /** Lets a test stand a server in front of the retry loop. */
    OpenAIServiceDraftExtractionProvider(
            ObjectMapper objectMapper,
            RestClient restClient,
            String apiKey,
            String model
    ) {
        this.objectMapper = objectMapper;
        this.restClient = restClient;
        this.apiKey = blankToNull(apiKey);
        this.model = blankToDefault(model, "gpt-4o-mini");
    }

    public ReceiptDraftFields extractFields(String rawOcrText) {
        return extractFields(rawOcrText, VehicleContext.UNKNOWN);
    }

    /**
     * @param vehicle what the system already knows about the vehicle. Used to
     *     disambiguate wording and to choose the component vocabulary the model
     *     is allowed to answer from; never a source of extracted values.
     */
    public ReceiptDraftFields extractFields(String rawOcrText, VehicleContext vehicle) {
        if (apiKey == null) {
            throw new ReceiptProcessingException("OpenAI extraction is enabled but OPENAI_API_KEY is not configured.");
        }

        VehicleContext context = vehicle == null ? VehicleContext.UNKNOWN : vehicle;
        Truncation ocr = Truncation.of(rawOcrText, MAX_OCR_CHARS, "Receipt OCR text");
        ReceiptDraftFields fields = requestExtraction(
                systemPrompt(context),
                context.toPromptBlock() + "\nOCR text:\n" + ocr.text(),
                "OpenAI extraction",
                ocr.warnings(),
                ServiceDraftResponseSchema.forReceipt()
        );
        return withResolvedServiceDate(withResolvedOdometer(fields, ocr.text()), ocr.text());
    }

    /**
     * Settles which of the two small numbers in a printed date is the month.
     *
     * <p>Applied after extraction for the same reason the odometer is. The
     * prompt asks for {@code yyyy-MM-dd} and never says what order the receipt
     * printed, so the model decides per call and decides differently on
     * different calls: the JFTRUCK sales order came back 2026-08-11 on one run
     * and 2026-11-08 on the next, from one image. Asking for month-first in the
     * prompt was tried and dropped - it cannot be verified without a paid run
     * that varies, and this settles it the same way every time regardless. See
     * {@link ServiceDateResolver} for the four signals and their order.
     *
     * <p>An ambiguity the document never resolved is a note rather than a
     * warning: nothing went wrong, the receipt simply did not say, and the
     * owner is the one holding it.
     */
    private ReceiptDraftFields withResolvedServiceDate(ReceiptDraftFields fields, String ocrText) {
        if (fields == null) {
            return null;
        }
        ServiceDateResolver.Resolution resolution =
                ServiceDateResolver.resolve(ocrText, fields.serviceDate(), LocalDate.now());
        if (resolution.note() == null) {
            return fields;
        }

        List<String> warnings = new ArrayList<>(fields.warnings() == null ? List.of() : fields.warnings());
        List<String> confidenceNotes =
                new ArrayList<>(fields.confidenceNotes() == null ? List.of() : fields.confidenceNotes());
        if (resolution.ambiguous()) {
            confidenceNotes.add(resolution.note());
        } else {
            warnings.add(resolution.note());
        }

        return new ReceiptDraftFields(
                fields.documentType(),
                fields.documentNumber(),
                fields.referenceNumbers(),
                resolution.date(),
                fields.services(),
                fields.odometer(),
                fields.totalCost(),
                fields.shopName(),
                fields.location(),
                fields.remarks(),
                confidenceNotes,
                fields.fieldSources(),
                fields.fieldConfidence(),
                fields.aiSuggestedFields(),
                fields.classification(),
                warnings,
                fields.plateNumber(),
                fields.vinChassisNumber()
        );
    }

    /**
     * Replaces the extracted odometer when the document's own labels name a
     * different reading.
     *
     * <p>Applied after extraction rather than asked for in the prompt. A service
     * document prints several numbers shaped like an odometer - the reading, a
     * warranty limit, a next-service target, and a previous visit's mileage in
     * the history block - and the rules for telling them apart are mechanical.
     * Written as a prompt instruction the same rules moved the odometer score by
     * nothing across three measured runs and broke extraction on the longest
     * document in the set. See {@link OdometerResolver}.
     *
     * <p>The owner is told when this fires. A value quietly swapped for a
     * different one is worse than either value, because nobody can tell it
     * happened.
     */
    private ReceiptDraftFields withResolvedOdometer(ReceiptDraftFields fields, String ocrText) {
        if (fields == null) {
            return null;
        }
        Integer resolved = OdometerResolver.resolve(ocrText, fields.odometer());
        if (java.util.Objects.equals(resolved, fields.odometer())) {
            return fields;
        }

        List<String> warnings = new ArrayList<>(fields.warnings() == null ? List.of() : fields.warnings());
        warnings.add("Odometer read as " + resolved + " km from the reading printed on the document"
                + (fields.odometer() == null ? "." : ", not the " + fields.odometer()
                        + " first extracted - that figure sits under a different label."));

        return new ReceiptDraftFields(
                fields.documentType(),
                fields.documentNumber(),
                fields.referenceNumbers(),
                fields.serviceDate(),
                fields.services(),
                resolved,
                fields.totalCost(),
                fields.shopName(),
                fields.location(),
                fields.remarks(),
                fields.confidenceNotes(),
                fields.fieldSources(),
                fields.fieldConfidence(),
                fields.aiSuggestedFields(),
                fields.classification(),
                warnings,
                fields.plateNumber(),
                fields.vinChassisNumber()
        );
    }

    public ReceiptDraftFields extractVoiceFields(String transcript) {
        if (apiKey == null) {
            throw new ReceiptProcessingException("OpenAI voice extraction is enabled but OPENAI_API_KEY is not configured.");
        }
        if (transcript == null || transcript.isBlank()) {
            throw new ReceiptProcessingException("Voice transcript is required before structured extraction.");
        }

        Truncation spoken = Truncation.of(transcript, MAX_VOICE_TRANSCRIPT_CHARS, "Voice transcript");
        return requestExtraction(
                voiceSystemPrompt(),
                "Voice transcript:\n" + spoken.text(),
                "OpenAI voice extraction",
                spoken.warnings(),
                ServiceDraftResponseSchema.forVoice()
        );
    }

    private ReceiptDraftFields requestExtraction(
            String systemPrompt,
            String userContent,
            String operationLabel,
            List<String> inputWarnings,
            Map<String, Object> responseFormat
    ) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("model", model);
        request.put("temperature", 0);
        request.put("response_format", responseFormat);
        request.put("max_completion_tokens", MAX_COMPLETION_TOKENS);
        request.put("messages", List.of(
                Map.of(
                        "role", "system",
                        "content", systemPrompt
                ),
                Map.of(
                        "role", "user",
                        "content", userContent
                )
        ));

        ReceiptProcessingException lastFailure = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            Long retryAfterMillis = null;
            try {
                String responseBody = restClient.post()
                        .uri(OPENAI_CHAT_COMPLETIONS_URL)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.APPLICATION_JSON)
                        .body(request)
                        .retrieve()
                        .body(String.class);

                return parseOpenAIResponse(responseBody, inputWarnings);
            } catch (MalformedResponseException exception) {
                // Seen in practice: a strict schema guarantees the shape of what
                // the model generates, not that the body arrives whole. A second
                // request is as safe here as after a timeout - nothing was
                // stored either way - and it is the difference between a draft
                // with every field and a draft with none.
                // The reason travels with the message rather than only as a
                // cause. There are two ways to land here and they want opposite
                // fixes: the model stopping at the token limit mid-JSON, which
                // is a budget problem, and a body that genuinely will not parse,
                // which is not. Both used to surface as the same sentence, and
                // the golden set spent three runs reporting "could not be read"
                // while the specific explanation sat one exception down where
                // nothing printed it.
                //
                // Deliberately the message and not the response body: bodies
                // carry the receipt's contents - customer names, addresses,
                // plate numbers - and application logs are not a place to put
                // those. If the wording below ever proves too thin, add a
                // bounded redacted snippet, not the whole body.
                lastFailure = new ReceiptProcessingException(
                        operationLabel + " returned a response that could not be read: "
                                + describeCause(exception),
                        exception);
            } catch (RestClientResponseException exception) {
                int status = exception.getStatusCode().value();
                lastFailure = new ReceiptProcessingException(
                        operationLabel + " failed with HTTP status " + status + ".", exception);
                if (!isWorthRetrying(status)) {
                    throw lastFailure;
                }
                /*
                 * A 429 comes with the provider's own answer to "how long?".
                 * Ignoring it and retrying on our own schedule is how a rate
                 * limit turns into three rate limits.
                 */
                retryAfterMillis = retryAfterMillis(exception);
                if (retryAfterMillis != null && retryAfterMillis > MAX_HONORED_RETRY_AFTER_MILLIS) {
                    throw lastFailure;
                }
            } catch (RestClientException exception) {
                // No response at all: a timeout or a dropped connection. The
                // request was never known to have been applied, and extraction
                // has no side effects, so repeating it is safe.
                lastFailure = new ReceiptProcessingException(operationLabel + " request failed.", exception);
            }

            if (attempt < MAX_ATTEMPTS) {
                long wait = retryAfterMillis != null
                        ? retryAfterMillis
                        : RETRY_BASE_BACKOFF_MILLIS * (1L << (attempt - 1));
                backOff(wait, lastFailure);
            }
        }
        throw lastFailure;
    }

    /**
     * Whether an HTTP failure is the kind that a second attempt can clear.
     *
     * <p>429 and 5xx are the provider saying "not now"; every other status is
     * the provider saying "not like this", and repeating an identical request
     * only spends the owner's time before the same fallback. 400 in particular
     * means the request or its schema is wrong, which no amount of retrying
     * fixes.
     */
    private boolean isWorthRetrying(int status) {
        return status == 429 || status >= 500;
    }

    /**
     * The provider's requested wait in milliseconds, or null when it did not
     * ask for one. Only the numeric-seconds form is read; {@code Retry-After}
     * also permits an HTTP date, which OpenAI does not send, and guessing at a
     * malformed value is worse than falling back to our own backoff.
     */
    private Long retryAfterMillis(RestClientResponseException exception) {
        HttpHeaders headers = exception.getResponseHeaders();
        String value = headers == null ? null : headers.getFirst(HttpHeaders.RETRY_AFTER);
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            long seconds = Long.parseLong(value.trim());
            return seconds < 0 ? null : seconds * 1000L;
        } catch (NumberFormatException notSeconds) {
            return null;
        }
    }

    /**
     * The most specific thing known about why a response would not parse.
     *
     * <p>{@link MalformedResponseException} is raised either with an
     * explanation of its own - the token limit, which names the usage figures -
     * or by Jackson refusing the body, in which case Jackson's own message says
     * which character it choked on and where. Either is worth reporting; the
     * generic sentence alone is not.
     *
     * <p>Truncated because a Jackson parse error quotes the source around the
     * failure, and that quotation is receipt content.
     */
    private String describeCause(MalformedResponseException exception) {
        String own = exception.getMessage();
        if (own != null && !own.isBlank()) {
            return own;
        }
        Throwable cause = exception.getCause();
        if (cause == null || cause.getMessage() == null || cause.getMessage().isBlank()) {
            return "no reason reported";
        }
        String reported = cause.getMessage().replaceAll("\s+", " ").trim();
        return reported.length() <= 200 ? reported : reported.substring(0, 200) + "...";
    }

    private void backOff(long millis, ReceiptProcessingException failure) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw failure;
        }
    }

    public String model() {
        return model;
    }

    private ReceiptDraftFields parseOpenAIResponse(String responseBody, List<String> inputWarnings) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode choice = root.path("choices").path(0);
            JsonNode message = choice.path("message");
            // A strict schema guarantees the shape of a generation that
            // finishes. One stopped at the token limit is valid JSON's opening
            // half, and reporting that as invalid JSON sends the next reader
            // looking for a parsing bug instead of a long receipt.
            String finishReason = asText(choice.path("finish_reason"));
            if ("length".equals(finishReason)) {
                // Retryable, on evidence rather than hope: the golden set hit
                // this twice on receipts that extracted cleanly on the runs
                // either side, at temperature 0 with byte-identical input. It is
                // the model occasionally spiralling on a repeated array entry,
                // not the receipt being too long for the cap.
                throw new MalformedResponseException(
                        "OpenAI extraction hit the response token limit before finishing, so the"
                                + " receipt was only partly read (" + usageSummary(root) + ").");
            }
            // Structured Outputs answers a declined request with `refusal`
            // instead of `content`. Reporting it as missing JSON would send the
            // caller looking for a parsing bug.
            JsonNode refusal = message.path("refusal");
            if (refusal.isTextual() && !refusal.asText().isBlank()) {
                throw new ReceiptProcessingException("OpenAI extraction declined the request: " + refusal.asText());
            }
            JsonNode contentNode = message.path("content");
            if (contentNode.isMissingNode() || contentNode.asText().isBlank()) {
                throw new ReceiptProcessingException("OpenAI extraction returned no JSON content.");
            }

            JsonNode fieldsNode = objectMapper.readTree(stripMarkdownFence(contentNode.asText()));
            List<ServiceItemFields> services = asServiceItems(fieldsNode.get("services"));
            Map<String, Object> fieldSources = asObjectMap(fieldsNode.get("fieldSources"));
            Map<String, String> fieldConfidence = fieldConfidence(fieldsNode.get("fieldConfidence"), fieldSources);
            List<String> aiSuggestedFields = aiSuggestedFields(fieldsNode.get("aiSuggestedFields"), fieldSources);
            // Input warnings lead: if the model was shown only part of the
            // receipt, every field below is an answer about a fragment.
            List<String> warnings = new ArrayList<>(inputWarnings);
            warnings.addAll(asStringList(fieldsNode.get("warnings")));
            LocalDate serviceDate = asDate(fieldsNode.get("serviceDate"));
            Integer odometer = asOdometer(fieldsNode.get("odometer"), warnings);
            BigDecimal totalCost = asBigDecimal(fieldsNode.get("totalCost"));
            String shopName = asText(fieldsNode.get("shopName"));
            String location = asText(fieldsNode.get("location"));
            String plateNumber = asText(fieldsNode.get("plateNumber"));
            String vinChassisNumber = asText(fieldsNode.get("vinChassisNumber"));
            if (isInferredFactualValue(fieldSources, "serviceDate")) {
                serviceDate = null;
                warnings.add("Service date was not directly supported by receipt text and was left blank.");
            }
            if (isInferredFactualValue(fieldSources, "odometer")) {
                odometer = null;
                warnings.add("Odometer was not directly supported by receipt text and was left blank.");
            }
            if (isInferredFactualValue(fieldSources, "totalCost")) {
                totalCost = null;
                warnings.add("Total cost was not directly supported by receipt text and was left blank.");
            }
            if (isInferredFactualValue(fieldSources, "shopName")) {
                shopName = null;
                warnings.add("Shop name was not directly supported by receipt text and was left blank.");
            }
            if (isInferredFactualValue(fieldSources, "location")) {
                location = null;
                warnings.add("Location was not directly supported by receipt text and was left blank.");
            }
            /*
             * These two get the same treatment as every other factual value,
             * and it matters more here than most: an inferred plate would be
             * offered to the owner as something to write onto their vehicle.
             * A guess is not worth offering.
             */
            if (isInferredFactualValue(fieldSources, "plateNumber")) {
                plateNumber = null;
            }
            if (isInferredFactualValue(fieldSources, "vinChassisNumber")) {
                vinChassisNumber = null;
            }
            DocumentType documentType = DocumentType.fromNullable(asText(fieldsNode.get("documentType")));
            noteDocumentType(documentType, services, totalCost, warnings);
            reconcile(services, totalCost, warnings);
            return new ReceiptDraftFields(
                    documentType,
                    asText(fieldsNode.get("documentNumber")),
                    asStringList(fieldsNode.get("referenceNumbers")),
                    serviceDate,
                    services,
                    odometer,
                    totalCost,
                    shopName,
                    location,
                    asText(fieldsNode.get("remarks")),
                    asStringList(fieldsNode.get("confidenceNotes")),
                    fieldSources,
                    fieldConfidence,
                    aiSuggestedFields,
                    classification(fieldsNode.get("classification")),
                    warnings,
                    plateNumber,
                    vinChassisNumber
            );
        } catch (JsonProcessingException exception) {
            throw new MalformedResponseException(exception);
        }
    }

    /** Token counts from the response, for errors that are about size. */
    private String usageSummary(JsonNode root) {
        JsonNode usage = root.path("usage");
        return "prompt " + usage.path("prompt_tokens").asInt()
                + ", completion " + usage.path("completion_tokens").asInt()
                + ", cap " + MAX_COMPLETION_TOKENS;
    }

    /**
     * A reply that did not arrive as a whole, readable answer.
     *
     * <p>Separate from {@link ReceiptProcessingException} only so the retry loop
     * can tell "the reply did not come back intact" — worth another attempt —
     * apart from "the reply said no", which will say no again.
     */
    private static final class MalformedResponseException extends RuntimeException {
        MalformedResponseException(Throwable cause) {
            super("OpenAI extraction returned invalid JSON.", cause);
        }

        MalformedResponseException(String message) {
            super(message);
        }
    }

    /**
     * Says out loud what kind of document this was, when that changes how the
     * numbers should be trusted.
     *
     * <p>The warnings are the whole point of classifying. An estimate's total
     * is printed in the same font, in the same box, with the same peso sign as
     * a real one - on the Toyota Talisay visit the repair order read ₱5,534.01
     * and the invoice for the same work read ₱3,106.49 - so nothing about the
     * value itself will ever look wrong downstream. The only thing that can
     * flag it is knowing which sheet it came off, and that has to travel with
     * the draft rather than being worked out again later.
     */
    private void noteDocumentType(
            DocumentType documentType,
            List<ServiceItemFields> services,
            BigDecimal totalCost,
            List<String> warnings
    ) {
        if (!documentType.isCostAuthoritative() && totalCost != null) {
            warnings.add("This looks like " + article(documentType) + " rather than a final bill, so "
                    + totalCost.toPlainString() + " is what was quoted, not necessarily what was paid.");
        }
        if (documentType.isCostOnly() && (services == null || services.isEmpty())) {
            warnings.add("This document records payment but does not say what work was done."
                    + " The cost is reliable; the service details are missing and must not be guessed.");
        }
        if (documentType == DocumentType.NOT_A_RECEIPT) {
            warnings.add("This page does not appear to be a service document at all.");
        }
    }

    private String article(DocumentType documentType) {
        return switch (documentType) {
            case ESTIMATE -> "an estimate or repair order";
            case WORK_PERFORMED -> "a job card";
            case PARTS_SLIP -> "an internal parts slip";
            case NOT_A_RECEIPT -> "something other than a service document";
            default -> "a non-final document";
        };
    }

    private String systemPrompt(VehicleContext vehicle) {
        return """
                You are a vehicle service record extraction specialist for service center receipts, invoices, job orders, and official receipts.
                Use only the OCR text and page/source metadata. Do not use outside knowledge.

                DOCUMENT TYPE - decide this first, because it changes how every number below is read.

                Set "documentType" to exactly one of:

                SERVICE_INVOICE - the final bill: what was actually done and what was actually owed.
                  This is the DEFAULT. A small independent shop hands over one piece of paper that is
                  the invoice and the receipt at the same time, often with no title, no letterhead and
                  no tax boilerplate. That paper is SERVICE_INVOICE. So is a dealership SERVICE INVOICE
                  and a handwritten BILLING STATEMENT.

                OFFICIAL_RECEIPT - money only, with NO description of work anywhere on the page.
                  Choose this only when the document prints amounts, totals or tax lines and does not
                  list a single service, part or operation. A page naming even one article that was
                  bought is not this - it is PARTS_PURCHASE or SERVICE_INVOICE. A page headed "OFFICIAL RECEIPT" that DOES
                  itemise work is SERVICE_INVOICE, not this.

                ESTIMATE - proposed work at proposed prices, produced before the job was done.
                  Repair orders, job orders, quotations, estimates, "for approval" sheets.

                WORK_PERFORMED - a description of work with no prices at all: a job card, or the
                  technician's list of what was done.

                PARTS_SLIP - an internal parts list with no prices: picking slip, delivery slip,
                  parts issue slip. Usually names locations, part numbers and quantities only.

                PARTS_PURCHASE - goods bought over the counter, priced, with NO labour on the page.
                  Every line is a part or a material and there is no operation anywhere: a battery, a
                  bulb, a litre of oil, sold and paid for. Nobody worked on the vehicle. Choose this
                  over SERVICE_INVOICE only when the document itemises goods and no work at all - a
                  sheet billing parts AND labour together is a SERVICE_INVOICE however it is titled.

                INSPECTION_REPORT - a finding about the vehicle condition, with no work done and no
                  prices. Battery test slips, emission test results, diagnostic scan reports, PMS
                  inspection checklists. It reports measurements and a verdict - readings, percentages,
                  pass/fail, replace/keep - rather than anything performed on the car. Choose this over
                  WORK_PERFORMED when nothing was actually done, only measured.

                NOT_A_RECEIPT - not a service document at all. A photo of something else entirely.

                THE RULE THAT MATTERS: SERVICE_INVOICE is what you return unless another type is
                EARNED by evidence printed on the page. Absence of evidence is not evidence. Do not
                reason "this has no invoice number, so it might be an estimate" - a shop that writes
                on a notepad prints no numbers at all and is still handing over a final bill.

                Evidence that earns ESTIMATE, and nothing weaker:
                  - The words ESTIMATE, QUOTATION, QUOTE, REPAIR ORDER, JOB ORDER, PROFORMA appear as
                    a heading or document title.
                  - The page states its figures are not final - for example "THIS IS ONLY AN ESTIMATE",
                    "parts found defective during the actual repair are not included", "subject to
                    change", "for approval".
                A promised delivery date, an appointment time, or a customer signature block does NOT
                make a document an estimate. Final bills carry those too. Neither does the word ORDER on
                its own: a SALES ORDER or DELIVERY ORDER itemising completed work with a total is a final
                bill, and only REPAIR ORDER, JOB ORDER and the estimate words above count as evidence.

                Classify by what the document CONTAINS, never by what it is TITLED. The title is
                evidence, not the decision.

                Also extract, from the document's own print and never invented:
                  - "documentNumber": this document's own reference - invoice number, OR number,
                    repair order number. Null if it prints none. Never a TIN, permit or barcode.
                  - "referenceNumbers": other document numbers this page points AT - for example an
                    official receipt naming the invoice it paid, or an invoice naming its repair
                    order. Empty array if there are none. These link the documents of one visit
                    together; do not put this document's own number here.

                When documentType is ESTIMATE, still extract the printed totals and line amounts
                exactly as printed. Do not blank them and do not adjust them. They are recorded as
                what was quoted, and the caller decides what to do with them.

                A vehicle description is given above the OCR text. It is context for interpretation
                only and is NEVER a source of extracted values. Do not copy the make, model, year,
                plate number or odometer from it into any field: if the receipt does not print a
                value, that value is missing, no matter what the vehicle block says.

                Use the vehicle for four things and nothing else:
                1. Disambiguating wording. "CVT" is a transmission on a car and the drive unit on a
                   scooter or motorcycle. "Chain and sprocket", "roller", "pulley" and "belt" are
                   drivetrain on a motorcycle. A motorcycle has no air conditioning, so "AC" on a
                   motorcycle receipt is almost certainly an OCR error or an unrelated line.
                2. Choosing relatedComponents from the list below, which is already narrowed to the
                   components this class of vehicle actually has.
                3. Judging whether an odometer reading is plausible. Odometers only increase. A
                   reading below the vehicle's last recorded odometer, or implausibly far above it,
                   should still be extracted as printed but must carry a warning.
                4. Noticing that the receipt may not belong to this vehicle at all. If the receipt
                   prints a plate number, make or model that clearly conflicts with the vehicle
                   above, extract what the receipt says and add a warning naming the conflict. Do
                   not silently correct either one.
                Return strict JSON only. Do not include markdown or explanation.

                The OCR text preserves the printed layout where it could be recovered. Each line of
                the text is one row as it was printed on the paper, and a vertical bar separates
                columns within that row. So "REPLACE CONDENSER | 350.00" is a single printed row whose
                description column reads REPLACE CONDENSER and whose amount column reads 350.00, and
                the amount belongs to that line and no other. Use this: it is the difference between
                knowing which price goes with which line and guessing.
                A row may have one column or several. Some receipts recover no layout at all and
                arrive as plain reading order; when there are no bars, fall back to reading the text
                as prose and say so in a warning if line amounts become uncertain.

                Receipts come from many different shops with no fixed layout. The OCR text may still contain
                content that is not part of the service transaction itself. Ignore the following entirely -
                do not copy it into any field, do not let it influence classification, and do not mention it
                in confidenceNotes or warnings unless it is directly conflicting with a real field value:
                - Barcodes, QR code strings, or long alphanumeric codes with no surrounding label or context.
                - Marketing slogans, promotions, loyalty program text, social media handles or hashtags.
                - Generic greetings or sign-offs ("Thank you for your business", "Please come again").
                - Printed legal boilerplate, warranty disclaimers, or terms-and-conditions paragraphs.
                - Tax registration numbers, business permit numbers, or accreditation numbers that are not the total cost.
                - Cashier names, queue numbers, or POS system metadata unrelated to the vehicle or service.
                Example: OCR text containing "Follow us @shopname for promos!" or "All sales are final, see terms
                on back" must not appear in remarks, partsReplaced, laborPerformed, or any other field.
                When in doubt whether a line is transaction content or boilerplate, prefer leaving it out rather
                than including it in a field or in confidenceNotes/warnings.

                Factual values must be directly supported by visible OCR text. Do not invent or infer factual values.
                Factual values include serviceDate, totalCost, odometer, shopName, location, plateNumber, VIN, and chassis number.
                If a factual value is missing or uncertain, return null for that field.

                plateNumber and vinChassisNumber are now returned fields. Fill them only from what the
                receipt itself prints — a plate, conduction sticker, VIN, chassis or engine number in
                the vehicle block of the paper. The vehicle description given above the OCR text is
                still never a source: if the receipt does not print the value, return null even when
                the vehicle block above has one. Copy the characters exactly as printed, including any
                dashes or spaces, and do not tidy them up. If the reading is doubtful — a character
                that could be O or 0, I or 1, B or 8 — still return what you read, and add a warning
                saying which characters were unclear.
                If multiple possible factual values exist, choose the clearest source-supported value only and add a warning.

                A single visit/receipt can include multiple distinct services (for example an oil change
                and a tire rotation on the same receipt). Return each distinct service performed as a
                separate entry in the "services" array, each with its own serviceType, partsReplaced,
                and laborPerformed. If only one service was performed, return a single-entry array.
                If the receipt truly has no identifiable services, return an empty array.

                LINE ENTRIES - the most important part of this task.

                Every printed, itemised line on the receipt must appear exactly once in the
                "lineEntries" array of the service it belongs to. A line is one of exactly four kinds,
                and getting the kind right matters more than getting the wording right:

                OPERATION - labour the shop performed. Verbs and job names: "REPLACE CONDENSER",
                  "PAINTING JOB", "SRA/FIX", "CHANGE OIL", "WHEEL ALIGNMENT", "CBWS".
                  This is the ONLY kind that says which part of the vehicle was worked on.
                PART - a component fitted to the vehicle and still on it when it leaves:
                  "CONDENSER", "OIL FILTER", "BRAKE PAD SET", "FLOORMAT", "PLASTIC COVER SET".
                MATERIAL - consumed doing the work, not part of the vehicle: paint, thinner,
                  masking tape, masking paper, degreaser, rubbing compound, body filler, waste pads,
                  rags, cleaning cloths, sandpaper, sealant.
                FEE - charged but neither: shop supplies, disposal, towing, diagnostic fee,
                  environmental charge, handling.

                Why the distinction matters: a body-and-paint invoice bills a painting job, a floor mat,
                and eleven consumables including a waste pad. Read as one undifferentiated list, "WASTE
                PAD" looks like brake work and the owner is shown a brake service that never happened.
                Materials and fees are evidence of cost only. They never indicate a serviced component.

                The same noun often appears twice, once as a part and once as the labour of fitting it.
                "CONDENSER 150.00" and "REPLACE CONDENSER 350.00" are two separate lines, one PART and
                one OPERATION. Do not merge them and do not drop either.

                When you cannot tell which kind a line is, choose MATERIAL. It is the kind that claims
                least: guessing PART adds a component the vehicle may not have, and guessing OPERATION
                lets the line be attributed to a part of the vehicle on no evidence.

                COMPLETENESS. Every itemised line printed on the document must appear in exactly one
                service's lineEntries, WHETHER OR NOT IT CARRIES A PRICE. Before returning, count the
                lineEntries across all services and compare that count against the number of itemised
                lines on the document. They must be equal. A dropped line is work or a part the record
                will not show, and where the line was priced it is also money the owner paid, which
                makes the totals impossible to reconcile.

                A PRICE IS NOT WHAT MAKES SOMETHING A LINE. Whole classes of real document itemise
                work and parts and print no amounts anywhere: a parts picking slip lists part numbers,
                descriptions and quantities; a job card lists what the technician did; a battery or
                emission test slip reports what was checked and what was found. These documents are
                the entire record of what happened to the car, and returning an empty lineEntries
                array for them discards all of it.

                For such a line, return it with lineTotal, unitPrice and quantity null unless the
                document actually prints them, and choose the kind from what the line describes
                exactly as you would on a priced receipt. "OIL FILTER | 1 | EA" on a picking slip is a
                PART with quantity 1 and no price. "Change oil and oil filter" on a job card is an
                OPERATION with no price. Null prices are the correct answer here, not a reason to omit
                the line.

                When the document prints no total either, totalCost is null and the lines still stand.
                A document can describe work completely and cost nothing.

                The grouping into services is a convenience; the lines are the record. Never drop a
                line because it does not fit the service you chose to create. Receipts commonly list
                all the parts together first and all the labour together afterwards, so a service
                built around one operation will have parts sitting outside it - attach them to the
                service they belong to rather than discarding them.

                When in doubt, return FEWER services. One service holding every line is always
                acceptable and is the right answer whenever the receipt is not clearly divided into
                separate jobs. Splitting a receipt into one service per operation and losing the
                part lines is the worst outcome available.

                Do not drop a line because its wording overlaps another line: a receipt billing
                "CONDENSER 150.00" and "REPLACE CONDENSER 350.00" has two lines, one PART and one
                OPERATION, and both must be returned.

                Most receipts print one amount per line, with no separate quantity and unit-price
                columns. When a line shows a single amount, that amount is the lineTotal. Leave
                unitPrice null unless the receipt actually prints a unit price and a quantity as
                separate figures. "CONDENSER 150.00" is lineTotal 150.00 with a null unitPrice and a
                null quantity - not a unit price of 150.00.

                Line prices are factual values and the no-invention rule applies to them in full.
                Copy quantity, unitPrice and lineTotal only when the number is clearly associated with
                that line in the OCR text. Receipts are printed as tables, and OCR often separates a
                column of prices from the descriptions they belong to - when that has happened and you
                cannot tell which price belongs to which line, return null for those numbers and add a
                warning. Guessing an amount is worse than omitting it.

                Every lineEntries object must have exactly these keys:
                kind, description, partCode, quantity, unitPrice, lineTotal.
                description is the printed text of the line, cleaned of column noise but not reworded.
                partCode is the shop's own code for the line when one is printed
                (Toyota OPERATION CODE/PART NO. values such as 72990-YZA12 or TTY-DEGREASER),
                otherwise null.
                quantity, unitPrice and lineTotal are numeric or null.
                If the receipt has no itemised lines at all, return an empty lineEntries array.

                Also return "lineCost" per service: the subtotal for that one service when the receipt
                prints one, otherwise null. Do not compute it yourself.

                You may classify or infer these per-service fields from OCR text:
                serviceType, laborPerformed, partsReplaced.
                Also infer the visit-level "remarks" field (notes that are not specific to one service).
                These inferred or summarized values must be labeled as AI-suggested with sourceType INFERRED_FROM_TEXT or EXTRACTED_AND_SUMMARIZED, confidence medium or low unless the source text is explicit, and needsReview true.

                Field-level evidence is required for exactly these fields, including when the
                field is missing: %s.
                Each fieldSources entry must be an object with:
                value, confidence, sourceType, sourceText, pageNumber, needsReview.
                confidence must be one of high, medium, low, not_found.
                sourceType must be one of EXTRACTED_FROM_TEXT, INFERRED_FROM_TEXT, EXTRACTED_AND_SUMMARIZED, NOT_FOUND, CONFLICTING.
                sourceText must be the shortest useful OCR snippet supporting the value, or null when not found.
                pageNumber must be a number when identifiable, otherwise null.
                needsReview must be true for inferred, summarized, low-confidence, not_found, or conflicting fields.

                Dates should be ISO format yyyy-MM-dd when possible.
                totalCost should be numeric when possible.
                odometer should be numeric when possible.
                Classification must use only these serviceCategory values:
                Maintenance, Repair, Inspection, Replacement, Warranty, Emergency, Other.
                Classification relatedComponents must use only these values, which are the
                components a %s has:
                %s.
                Values outside this list are rejected. If the best word for something is not on the
                list, choose the closest listed component and say so in classification notes rather
                than inventing a label.
                You may infer classification labels from serviceType, partsReplaced,
                laborPerformed, remarks, and OCR text. Do not invent factual values.
                Mark inferred classification as AI-suggested and set needsOwnerReview true.
                Add classification notes when serviceType is inferred from labor/parts,
                multiple components are detected, confidence is medium or low,
                source documents are multi-page, or classification is uncertain.

                Return exactly these keys:
                serviceDate, services, odometer, totalCost, shopName, location,
                remarks, classification, confidenceNotes, fieldSources,
                fieldConfidence, aiSuggestedFields, warnings.
                services must be an array of objects, each with exactly these keys:
                serviceType, partsReplaced, laborPerformed, lineCost, lineEntries.
                partsReplaced and laborPerformed are legacy summary fields kept for older records;
                fill them in as before, but lineEntries is the authoritative breakdown and a
                consumable must never be summarised into partsReplaced.
                classification must be an object with exactly these keys:
                normalizedServiceType, serviceCategory, relatedComponents, recordTags,
                confidence, source, needsOwnerReview, notes.
                classification.confidence must be high, medium, or low.
                classification.source must be AI.
                confidenceNotes must be an array of short user-safe notes about uncertain, inferred, conflicting, or missing fields.
                fieldConfidence must map those same field names to high, medium, low, or not_found.
                aiSuggestedFields must list field names whose sourceType is INFERRED_FROM_TEXT or EXTRACTED_AND_SUMMARIZED.
                warnings must be an array of short user-safe notes about conflicts or limitations.
                """.formatted(
                ServiceDraftResponseSchema.evidenceFieldList(),
                vehicle.isMotorcycle() ? "motorcycle" : "car",
                String.join(", ", vehicle.allowedComponents()));
    }

    private String voiceSystemPrompt() {
        return """
                You are a vehicle service record extraction specialist for spoken owner notes.
                Use only the voice transcript. Do not invent missing values.
                Return strict JSON only. Do not include markdown or explanation.
                Missing, unrelated, or uncertain fields must be null.
                If the transcript is casual conversation or not about a vehicle service event, return null for all service fields.
                Extract a field only when the transcript clearly supports it.
                Dates should be ISO format yyyy-MM-dd when possible.
                totalCost should be numeric when possible.
                odometer should be numeric when possible.
                A single spoken description can mention multiple distinct services (for example an oil
                change and a tire rotation in the same visit). Return each distinct service performed as
                a separate entry in the "services" array, each with its own serviceType, partsReplaced,
                and laborPerformed. If only one service was mentioned, return a single-entry array. If no
                service is clearly described, return an empty array.
                serviceType should be a concise service label only when a service is explicitly described.
                shopName should capture a named repair shop, garage, service center, dealership, or auto shop only when the speaker explicitly names it.
                Examples of explicit support include phrases like "at Superior Auto Repairs", "from Midas", "the shop name is Quick Fix Motors", or "serviced at Toyota Service Center".
                Return null for shopName when the transcript only says a generic mechanic, technician, or shop without a specific business name.
                partsReplaced should include only explicit parts, attributed to the correct service entry.
                laborPerformed should include only explicit work performed, attributed to the correct service entry.
                remarks should include only explicit visit-level notes that do not fit another field.
                Classification must use only these serviceCategory values:
                Maintenance, Repair, Inspection, Replacement, Warranty, Emergency, Other.
                Classification relatedComponents must use only these values:
                Engine, Engine Oil, Oil Filter, Brakes, Tires, Battery, Air Filter,
                Transmission, Cooling System, Suspension, Lights, AC System,
                Electrical, Body, Fluids, Other.
                You may infer classification labels from the transcript, serviceType,
                partsReplaced, laborPerformed, and remarks. Do not invent factual values.
                Mark inferred classification as AI-suggested and set needsOwnerReview true.

                Return exactly these keys:
                serviceDate, services, odometer, totalCost, shopName, location,
                remarks, classification, confidenceNotes, fieldSources,
                fieldConfidence, aiSuggestedFields, warnings.
                services must be an array of objects, each with exactly these keys:
                serviceType, partsReplaced, laborPerformed, lineCost, lineEntries.
                partsReplaced and laborPerformed are legacy summary fields kept for older records;
                fill them in as before, but lineEntries is the authoritative breakdown and a
                consumable must never be summarised into partsReplaced.
                classification must be an object with exactly these keys:
                normalizedServiceType, serviceCategory, relatedComponents, recordTags,
                confidence, source, needsOwnerReview, notes.
                classification.confidence must be high, medium, or low.
                classification.source must be AI.
                confidenceNotes must be an array of short strings about uncertain, missing, or unrelated fields.
                fieldSources must be an object with exactly these keys, each set to
                "voice transcript" when the field was extracted and null when it was not: %s.
                fieldConfidence must map those same keys to high, medium, low, or not_found.
                aiSuggestedFields and warnings must be arrays.
                A voice note has no printed lines, so every service's lineEntries is an empty
                array and lineCost is null.
                """.formatted(ServiceDraftResponseSchema.evidenceFieldList());
    }

    private LocalDate asDate(JsonNode node) {
        String value = asText(node);
        if (value == null) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    /**
     * A whole number, read as a number rather than as a run of digits.
     *
     * <p>This used to strip every non-digit character and parse what was left,
     * which reads "12,345.6 km" as 123456 — an odometer ten times the real one,
     * and plausible enough that nothing downstream would question it. Grouping
     * separators are dropped, a decimal point is a decimal point, and the value
     * is rounded rather than concatenated.
     *
     * <p>Anything that does not fit an {@code int} returns null. A receipt
     * cannot print a number that large about a vehicle, so the value is not a
     * large reading, it is a misread.
     */
    private Integer asInteger(JsonNode node) {
        BigDecimal value = asBigDecimal(node);
        if (value == null) {
            return null;
        }
        try {
            return value.setScale(0, java.math.RoundingMode.HALF_UP).intValueExact();
        } catch (ArithmeticException ignored) {
            return null;
        }
    }

    /**
     * The odometer, or null with a warning when the number cannot be one.
     *
     * <p>{@code DraftPlausibilityService} already compares a reading against the
     * vehicle's history, but it has nothing to compare against on a vehicle's
     * first receipt — exactly the case where an extra digit or a misplaced
     * decimal has nothing to contradict it. This is the check that needs no
     * history: no vehicle has travelled a negative distance, and none reaches
     * {@value #MAX_PLAUSIBLE_ODOMETER_KM} km.
     */
    private Integer asOdometer(JsonNode node, List<String> warnings) {
        Integer odometer = asInteger(node);
        if (odometer == null) {
            return null;
        }
        if (odometer < 0 || odometer > MAX_PLAUSIBLE_ODOMETER_KM) {
            warnings.add("The odometer read as " + odometer + " km, which no vehicle reaches."
                    + " It was left blank rather than recorded - enter it from the receipt.");
            return null;
        }
        return odometer;
    }

    private BigDecimal asBigDecimal(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            return node.decimalValue();
        }
        String value = asText(node);
        if (value == null) {
            return null;
        }
        String normalized = value.replaceAll("[^0-9.\\-]", "");
        if (normalized.isBlank() || ".".equals(normalized) || "-".equals(normalized)) {
            return null;
        }
        try {
            return new BigDecimal(normalized);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private String asText(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        String value = node.isTextual() ? node.asText() : node.toString();
        if (value.isBlank() || "null".equalsIgnoreCase(value)) {
            return null;
        }
        return value.trim();
    }

    private List<String> asStringList(JsonNode node) {
        if (node == null || node.isNull()) {
            return List.of();
        }
        if (node.isArray()) {
            List<String> values = objectMapper.convertValue(
                    node,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, String.class)
            );
            return values.stream().filter(value -> value != null && !value.isBlank()).map(String::trim).toList();
        }
        String value = asText(node);
        return value == null ? List.of() : List.of(value);
    }

    /**
     * Checks the extraction against itself.
     *
     * <p>A receipt carries its own checksum: the itemised lines sum to the
     * printed total, and when they do not, something was dropped or misread.
     * This is the one accuracy signal available without knowing the right
     * answer, and it costs a subtraction.
     *
     * <p>It catches the failures that are otherwise invisible. Google Vision
     * drops blocks below its confidence threshold, silently removing a line and
     * its cost. OCR turns a printed 350.00 into "350.&#162;" and the line comes
     * back unpriced. A misread digit turns 1,450.00 into 145.00, which looks
     * perfectly plausible on its own and is obvious against a total.
     *
     * <p>Deliberately a warning rather than a correction. The gap says one of
     * the two figures is wrong, not which, and quietly rewriting the total to
     * match the lines would be inventing a value — the thing this pipeline is
     * least allowed to do. The owner sees the discrepancy and decides.
     */
    private void reconcile(List<ServiceItemFields> services, BigDecimal totalCost, List<String> warnings) {
        if (services == null || services.isEmpty() || totalCost == null) {
            return;
        }
        List<BigDecimal> priced = services.stream()
                .flatMap(service -> service.lineEntriesOrEmpty().stream())
                .map(ServiceLineEntryFields::lineTotal)
                .filter(java.util.Objects::nonNull)
                .toList();
        if (priced.isEmpty()) {
            return;
        }

        BigDecimal sum = priced.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal gap = sum.subtract(totalCost).abs();
        if (gap.compareTo(RECONCILE_TOLERANCE) <= 0) {
            return;
        }
        warnings.add(String.format(
                "The %d itemised lines add up to %s but the receipt total reads %s, a difference of %s."
                        + " One of the two was misread - check the lines against the receipt before confirming.",
                priced.size(), sum.toPlainString(), totalCost.toPlainString(), gap.toPlainString()));
    }

    private List<ServiceItemFields> asServiceItems(JsonNode node) {
        List<ServiceItemFields> services = new ArrayList<>();
        if (node == null || node.isNull() || !node.isArray()) {
            return services;
        }
        for (JsonNode itemNode : node) {
            String serviceType = asText(itemNode.get("serviceType"));
            if (serviceType == null) {
                continue;
            }
            services.add(new ServiceItemFields(
                    serviceType,
                    asText(itemNode.get("partsReplaced")),
                    asText(itemNode.get("laborPerformed")),
                    asBigDecimal(itemNode.get("lineCost")),
                    asLineEntries(itemNode.get("lineEntries")),
                    null
            ));
        }
        return services;
    }

    /**
     * The itemised lines of one service.
     *
     * <p>Until this existed the pipeline passed {@code List.of()} here and every
     * receipt-created draft saved zero line entries, which left migration
     * {@code 011} — the schema, the backfill and the whole operation-only
     * attribution rule — reachable from manual entry and nothing else.
     *
     * <p>A line with no description is dropped rather than kept: it cannot be
     * matched, attributed or shown to anyone, and an unlabelled row on a
     * receipt breakdown is worse than a missing one. The kind is resolved
     * through {@link ServiceLineKind#fromNullable}, which defaults anything
     * unrecognised to MATERIAL — the kind that claims least.
     */
    private List<ServiceLineEntryFields> asLineEntries(JsonNode node) {
        List<ServiceLineEntryFields> entries = new ArrayList<>();
        if (node == null || node.isNull() || !node.isArray()) {
            return entries;
        }
        for (JsonNode entryNode : node) {
            String description = asText(entryNode.get("description"));
            if (description == null) {
                continue;
            }
            entries.add(new ServiceLineEntryFields(
                    ServiceLineKind.fromNullable(asText(entryNode.get("kind"))).name(),
                    description,
                    asText(entryNode.get("partCode")),
                    asBigDecimal(entryNode.get("quantity")),
                    asBigDecimal(entryNode.get("unitPrice")),
                    asBigDecimal(entryNode.get("lineTotal"))
            ));
        }
        return entries;
    }

    private Map<String, Object> asObjectMap(JsonNode node) {
        if (node == null || node.isNull() || !node.isObject()) {
            return Map.of();
        }
        Map<String, Object> values = objectMapper.convertValue(
                node,
                objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class)
        );
        return values == null ? Map.of() : values;
    }

    private Map<String, String> fieldConfidence(JsonNode node, Map<String, Object> fieldSources) {
        Map<String, String> values = new LinkedHashMap<>();
        if (node != null && node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                String confidence = normalizeConfidence(asText(entry.getValue()));
                if (confidence != null) {
                    values.put(entry.getKey(), confidence);
                }
            });
        }
        fieldSources.forEach((fieldName, evidence) -> {
            if (values.containsKey(fieldName) || !(evidence instanceof Map<?, ?> evidenceMap)) {
                return;
            }
            String confidence = normalizeConfidence(evidenceMap.get("confidence") == null ? null : String.valueOf(evidenceMap.get("confidence")));
            if (confidence != null) {
                values.put(fieldName, confidence);
            }
        });
        return values;
    }

    private List<String> aiSuggestedFields(JsonNode node, Map<String, Object> fieldSources) {
        List<String> values = new ArrayList<>(asStringList(node));
        fieldSources.forEach((fieldName, evidence) -> {
            if (!(evidence instanceof Map<?, ?> evidenceMap) || values.contains(fieldName)) {
                return;
            }
            String sourceType = evidenceMap.get("sourceType") == null ? "" : String.valueOf(evidenceMap.get("sourceType"));
            if ("INFERRED_FROM_TEXT".equalsIgnoreCase(sourceType) || "EXTRACTED_AND_SUMMARIZED".equalsIgnoreCase(sourceType)) {
                values.add(fieldName);
            }
        });
        return values;
    }

    private ServiceClassification classification(JsonNode node) {
        if (node == null || node.isNull() || !node.isObject()) {
            return null;
        }
        return new ServiceClassification(
                asText(node.get("normalizedServiceType")),
                asText(node.get("serviceCategory")),
                asStringList(node.get("relatedComponents")),
                asStringList(node.get("recordTags")),
                asText(node.get("confidence")),
                asText(node.get("source")),
                asStringList(node.get("notes")),
                node.has("needsOwnerReview") && node.get("needsOwnerReview").asBoolean(true)
        );
    }

    private String normalizeConfidence(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim().toLowerCase();
        return switch (normalized) {
            case "high", "medium", "low", "not_found" -> normalized;
            default -> null;
        };
    }

    private boolean isInferredFactualValue(Map<String, Object> fieldSources, String fieldName) {
        Object evidence = fieldSources.get(fieldName);
        if (!(evidence instanceof Map<?, ?> evidenceMap)) {
            return false;
        }
        Object sourceTypeNode = evidenceMap.get("sourceType");
        if (sourceTypeNode == null) {
            return false;
        }
        String sourceType = String.valueOf(sourceTypeNode);
        return "INFERRED_FROM_TEXT".equalsIgnoreCase(sourceType)
                || "EXTRACTED_AND_SUMMARIZED".equalsIgnoreCase(sourceType);
    }

    private Map<String, String> asStringMap(JsonNode node) {
        if (node == null || node.isNull() || !node.isObject()) {
            return Map.of();
        }
        Map<String, String> values = new LinkedHashMap<>();
        node.fields().forEachRemaining(entry -> {
            String value = asText(entry.getValue());
            if (value != null) {
                values.put(entry.getKey(), value);
            }
        });
        return values;
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

    /**
     * Text as the model will actually see it, plus a warning for whatever the
     * length cap cut off.
     *
     * <p>Truncation used to be silent here and warned about by the caller,
     * which re-derived the condition from its own copy of the limit. That
     * warned on the raw-OCR fallback, where nothing had been truncated because
     * no request was ever made, and it would have gone quiet the moment either
     * copy of the number moved. The code that cuts the text is the only code
     * that knows a cut happened, so it is the code that reports it.
     *
     * <p>The cut lands on a line boundary. A receipt row split down the middle
     * still reads as a row, and a description that lost its price is a line the
     * model will price from context - which is guessing.
     */
    private record Truncation(String text, List<String> warnings) {
        static Truncation of(String value, int maxChars, String label) {
            if (value == null || value.length() <= maxChars) {
                return new Truncation(value, List.of());
            }
            int lastNewline = value.lastIndexOf('\n', maxChars);
            int cut = lastNewline > 0 ? lastNewline : maxChars;
            return new Truncation(value.substring(0, cut), List.of(String.format(
                    "%s ran to %d characters and only the first %d were read. The rest of it -"
                            + " which is where the total and the last pages usually are - was not"
                            + " seen, so anything below may be incomplete.",
                    label, value.length(), cut)));
        }
    }

    private String blankToDefault(String value, String fallback) {
        String normalized = blankToNull(value);
        return normalized == null ? fallback : normalized;
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
