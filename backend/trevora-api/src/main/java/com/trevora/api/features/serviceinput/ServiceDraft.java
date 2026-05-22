package com.trevora.api.features.serviceinput;

import com.trevora.api.features.serviceinput.DraftStatus;
import com.trevora.api.features.serviceinput.InputMethod;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "service_drafts")
public class ServiceDraft {
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "draft_id")
    private UUID draftId;

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "input_method", nullable = false)
    private InputMethod inputMethod;

    @Column(name = "service_date")
    private LocalDate serviceDate;

    @Column(name = "service_type")
    private String serviceType;

    private Integer odometer;

    @Column(name = "total_cost", precision = 12, scale = 2)
    private BigDecimal totalCost;

    @Column(name = "shop_name")
    private String shopName;

    private String location;

    @Column(name = "parts_replaced", columnDefinition = "text")
    private String partsReplaced;

    @Column(name = "labor_performed", columnDefinition = "text")
    private String laborPerformed;

    @Column(columnDefinition = "text")
    private String remarks;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DraftStatus status;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "field_metadata", columnDefinition = "jsonb")
    private Map<String, Object> fieldMetadata;

    @Column(name = "receipt_storage_bucket")
    private String receiptStorageBucket;

    @Column(name = "receipt_storage_path", columnDefinition = "text")
    private String receiptStoragePath;

    @Column(name = "receipt_original_filename")
    private String receiptOriginalFilename;

    @Column(name = "receipt_content_type")
    private String receiptContentType;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getDraftId() {
        return draftId;
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

    public InputMethod getInputMethod() {
        return inputMethod;
    }

    public void setInputMethod(InputMethod inputMethod) {
        this.inputMethod = inputMethod;
    }

    public LocalDate getServiceDate() {
        return serviceDate;
    }

    public void setServiceDate(LocalDate serviceDate) {
        this.serviceDate = serviceDate;
    }

    public String getServiceType() {
        return serviceType;
    }

    public void setServiceType(String serviceType) {
        this.serviceType = serviceType;
    }

    public Integer getOdometer() {
        return odometer;
    }

    public void setOdometer(Integer odometer) {
        this.odometer = odometer;
    }

    public BigDecimal getTotalCost() {
        return totalCost;
    }

    public void setTotalCost(BigDecimal totalCost) {
        this.totalCost = totalCost;
    }

    public String getShopName() {
        return shopName;
    }

    public void setShopName(String shopName) {
        this.shopName = shopName;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getPartsReplaced() {
        return partsReplaced;
    }

    public void setPartsReplaced(String partsReplaced) {
        this.partsReplaced = partsReplaced;
    }

    public String getLaborPerformed() {
        return laborPerformed;
    }

    public void setLaborPerformed(String laborPerformed) {
        this.laborPerformed = laborPerformed;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public DraftStatus getStatus() {
        return status;
    }

    public void setStatus(DraftStatus status) {
        this.status = status;
    }

    public Map<String, Object> getFieldMetadata() {
        return fieldMetadata;
    }

    public void setFieldMetadata(Map<String, Object> fieldMetadata) {
        this.fieldMetadata = fieldMetadata;
    }

    public String getReceiptStorageBucket() {
        return receiptStorageBucket;
    }

    public void setReceiptStorageBucket(String receiptStorageBucket) {
        this.receiptStorageBucket = receiptStorageBucket;
    }

    public String getReceiptStoragePath() {
        return receiptStoragePath;
    }

    public void setReceiptStoragePath(String receiptStoragePath) {
        this.receiptStoragePath = receiptStoragePath;
    }

    public String getReceiptOriginalFilename() {
        return receiptOriginalFilename;
    }

    public void setReceiptOriginalFilename(String receiptOriginalFilename) {
        this.receiptOriginalFilename = receiptOriginalFilename;
    }

    public String getReceiptContentType() {
        return receiptContentType;
    }

    public void setReceiptContentType(String receiptContentType) {
        this.receiptContentType = receiptContentType;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
