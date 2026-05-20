package com.trevora.api.features.sharing;

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
@Table(name = "mechanic_access_requests")
public class MechanicAccessRequest {
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "mechanic_access_request_id")
    private UUID mechanicAccessRequestId;

    @Column(name = "qr_access_request_id", nullable = false)
    private UUID qrAccessRequestId;

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "mechanic_id")
    private UUID mechanicId;

    @Column(name = "mechanic_name", nullable = false)
    private String mechanicName;

    @Column(name = "shop_name")
    private String shopName;

    @Column(name = "contact_info")
    private String contactInfo;

    @Column(columnDefinition = "text")
    private String reason;

    @Column(nullable = false)
    private String status;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getMechanicAccessRequestId() {
        return mechanicAccessRequestId;
    }

    public UUID getQrAccessRequestId() {
        return qrAccessRequestId;
    }

    public void setQrAccessRequestId(UUID qrAccessRequestId) {
        this.qrAccessRequestId = qrAccessRequestId;
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

    public String getMechanicName() {
        return mechanicName;
    }

    public void setMechanicName(String mechanicName) {
        this.mechanicName = mechanicName;
    }

    public String getShopName() {
        return shopName;
    }

    public void setShopName(String shopName) {
        this.shopName = shopName;
    }

    public String getContactInfo() {
        return contactInfo;
    }

    public void setContactInfo(String contactInfo) {
        this.contactInfo = contactInfo;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public void setRequestedAt(Instant requestedAt) {
        this.requestedAt = requestedAt;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public void setDecidedAt(Instant decidedAt) {
        this.decidedAt = decidedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
