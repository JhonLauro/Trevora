package com.trevora.api.features.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.UuidGenerator;

/**
 * Owner feedback on an AI-generated plain language explanation.
 *
 * <p>One row per (record, owner). An owner may update their vote or
 * feedback reason, and the existing row updates in place.
 */
@Entity
@Table(name = "service_record_ai_feedback")
public class ServiceRecordAIFeedback {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "feedback_id")
    private UUID feedbackId;

    @Column(name = "record_id", nullable = false)
    private UUID recordId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "helpful", nullable = false)
    private boolean helpful;

    @Column(name = "reason")
    private String reason;

    @Column(name = "notes")
    private String notes;

    @Column(name = "language")
    private String language;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ServiceRecordAIFeedback() {
    }

    public ServiceRecordAIFeedback(
            UUID recordId,
            UUID userId,
            boolean helpful,
            String reason,
            String notes,
            String language
    ) {
        this.recordId = recordId;
        this.userId = userId;
        this.helpful = helpful;
        this.reason = reason;
        this.notes = notes;
        this.language = language;
    }

    public void update(boolean helpful, String reason, String notes, String language) {
        this.helpful = helpful;
        this.reason = reason;
        this.notes = notes;
        if (language != null && !language.isBlank()) {
            this.language = language;
        }
    }

    public UUID getFeedbackId() {
        return feedbackId;
    }

    public UUID getRecordId() {
        return recordId;
    }

    public UUID getUserId() {
        return userId;
    }

    public boolean isHelpful() {
        return helpful;
    }

    public String getReason() {
        return reason;
    }

    public String getNotes() {
        return notes;
    }

    public String getLanguage() {
        return language;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
