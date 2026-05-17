package com.trevora.api.model;

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

@Entity
@Table(name = "mechanic_access_sessions")
public class MechanicAccessSession {
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "mechanic_access_session_id")
    private UUID mechanicAccessSessionId;

    @Column(name = "mechanic_access_request_id", nullable = false)
    private UUID mechanicAccessRequestId;

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "mechanic_id")
    private UUID mechanicId;

    @Column(name = "session_token", nullable = false, unique = true)
    private String sessionToken;

    @Column(nullable = false)
    private String permission;

    @Column(nullable = false)
    private String status;

    @Column(name = "approved_at", nullable = false)
    private Instant approvedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getMechanicAccessSessionId() {
        return mechanicAccessSessionId;
    }

    public UUID getMechanicAccessRequestId() {
        return mechanicAccessRequestId;
    }

    public void setMechanicAccessRequestId(UUID mechanicAccessRequestId) {
        this.mechanicAccessRequestId = mechanicAccessRequestId;
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

    public UUID getMechanicId() {
        return mechanicId;
    }

    public void setMechanicId(UUID mechanicId) {
        this.mechanicId = mechanicId;
    }

    public String getSessionToken() {
        return sessionToken;
    }

    public void setSessionToken(String sessionToken) {
        this.sessionToken = sessionToken;
    }

    public String getPermission() {
        return permission;
    }

    public void setPermission(String permission) {
        this.permission = permission;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getApprovedAt() {
        return approvedAt;
    }

    public void setApprovedAt(Instant approvedAt) {
        this.approvedAt = approvedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
