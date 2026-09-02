package com.trevora.api.features.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * One model-written explanation, kept so it is written once rather than once
 * per view.
 *
 * <p>Only the prose is stored. The parts, materials, labour and cost shown
 * beside it are read from the record on every request, because they are the
 * owner's own figures and must never be served from a copy that has drifted.
 *
 * <p>The primary key is the record's own id: a record has one explanation or
 * none. There is no generator here for that reason.
 */
@Entity
@Table(name = "service_record_explanations")
public class ServiceRecordExplanation {
    @Id
    @Column(name = "record_id")
    private UUID recordId;

    /**
     * SHA-256 of the prompt this was written from.
     *
     * <p>The cache is valid exactly while this matches what the record would
     * produce now, so a corrected record regenerates without anyone having to
     * remember to clear a row.
     */
    @Column(name = "facts_fingerprint", nullable = false)
    private String factsFingerprint;

    @Column(name = "model", nullable = false)
    private String model;

    @Column(name = "what_was_done", nullable = false)
    private String whatWasDone;

    @Column(name = "why_it_matters", nullable = false)
    private String whyItMatters;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "watch_for", columnDefinition = "jsonb")
    private List<String> watchFor = new ArrayList<>();

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    protected ServiceRecordExplanation() {
    }

    ServiceRecordExplanation(
            UUID recordId,
            String factsFingerprint,
            String model,
            String whatWasDone,
            String whyItMatters,
            List<String> watchFor,
            Instant generatedAt
    ) {
        this.recordId = recordId;
        this.factsFingerprint = factsFingerprint;
        this.model = model;
        this.whatWasDone = whatWasDone;
        this.whyItMatters = whyItMatters;
        this.watchFor = new ArrayList<>(watchFor);
        this.generatedAt = generatedAt;
    }

    public UUID getRecordId() {
        return recordId;
    }

    public String getFactsFingerprint() {
        return factsFingerprint;
    }

    public String getModel() {
        return model;
    }

    public String getWhatWasDone() {
        return whatWasDone;
    }

    public String getWhyItMatters() {
        return whyItMatters;
    }

    public List<String> getWatchFor() {
        return watchFor == null ? List.of() : List.copyOf(watchFor);
    }

    public Instant getGeneratedAt() {
        return generatedAt;
    }
}
