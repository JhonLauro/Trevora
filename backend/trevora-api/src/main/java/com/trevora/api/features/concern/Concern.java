package com.trevora.api.features.concern;

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
 * Something the owner noticed about their own car, in their own words.
 *
 * <p><b>What is deliberately not here.</b> No category, no component, no
 * severity, no link to a service record, no diagnosis. Every other fact in this
 * codebase is inferred from a document and can be wrong; this is the one the
 * owner states directly, and its whole value is that nothing sits between what
 * they typed and what the mechanic reads.
 *
 * <p>The rule that keeps it that way: <b>concern text is never classified and
 * never attributed to a component.</b> Matching "weird sound when turning left"
 * against the component vocabulary would put a guess beside a first-hand
 * account — the same mistake migration 011 records, where a can of degreaser
 * became brake work and the owner was shown a service they never had.
 *
 * <p>{@code resolvedAt} is the only state. Null means open. Rows are never
 * deleted when resolved: a concern that turned out to be the brakes is worth
 * reading the next time the brakes come up.
 */
@Entity
@Table(name = "concerns")
public class Concern {
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "concern_id")
    private UUID concernId;

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    /**
     * Denormalised from the vehicle so a concern can be checked against the
     * caller without joining through it. Every read in this feature is scoped
     * on both, never on the vehicle alone.
     */
    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "note", nullable = false)
    private String note;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Null while the concern is open. */
    @Column(name = "resolved_at")
    private Instant resolvedAt;

    public UUID getConcernId() {
        return concernId;
    }

    public void setConcernId(UUID concernId) {
        this.concernId = concernId;
    }

    public UUID getVehicleId() {
        return vehicleId;
    }

    public void setVehicleId(UUID vehicleId) {
        this.vehicleId = vehicleId;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(UUID ownerId) {
        this.ownerId = ownerId;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public void setResolvedAt(Instant resolvedAt) {
        this.resolvedAt = resolvedAt;
    }

    public boolean isOpen() {
        return resolvedAt == null;
    }
}
