package com.trevora.api.features.servicerecord;

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
@Table(name = "service_records")
public class ServiceRecord {
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "record_id")
    private UUID recordId;

    @Column(name = "draft_id", nullable = false, unique = true)
    private UUID draftId;

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_input_method", nullable = false)
    private InputMethod sourceInputMethod;

    /**
     * Defaults to NEEDS_REVIEW rather than null: a record with no evidence of
     * review is unverified, and the absence of evidence must not read as
     * validation.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "validation_status", nullable = false)
    private ValidationStatus validationStatus = ValidationStatus.NEEDS_REVIEW;

    /**
     * What kind of document this record was confirmed from.
     *
     * <p>Carried over from the draft rather than re-derived. A record built
     * from an ESTIMATE holds a quoted total, and one built from an
     * OFFICIAL_RECEIPT holds a real total with no work behind it; both are
     * legitimate history and neither may be presented as an ordinary bill.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "document_type", nullable = false)
    private com.trevora.api.features.serviceinput.DocumentType documentType =
            com.trevora.api.features.serviceinput.DocumentType.defaultType();

    /**
     * The number to quote to the shop that did the work.
     *
     * <p>Carried over from the draft. It is the key to the shop's own system,
     * which holds far more about the visit than this record ever will - what
     * the technician found, the parts by number, the specs. Handing a mechanic
     * "Toyota Talisay, repair order G7IA123581" is the handoff working.
     */
    @Column(name = "document_number")
    private String documentNumber;

    /** The other documents of this visit, so the rest of the paperwork can be found. */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "reference_numbers", columnDefinition = "jsonb")
    private java.util.List<String> referenceNumbers = new java.util.ArrayList<>();

    @Column(name = "service_date", nullable = false)
    private LocalDate serviceDate;

    private Integer odometer;

    @Column(name = "total_cost", nullable = false, precision = 12, scale = 2)
    private BigDecimal totalCost;

    /**
     * What insurance or a warranty absorbed of {@link #totalCost}. Zero when
     * nothing was covered, never null.
     *
     * Out-of-pocket is deliberately not stored — see {@link #getOwnerPaid()}.
     */
    @Column(name = "amount_covered", nullable = false, precision = 12, scale = 2)
    private BigDecimal amountCovered = BigDecimal.ZERO;

    @Column(name = "shop_name")
    private String shopName;

    private String location;

    @Column(columnDefinition = "text")
    private String remarks;

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

    public UUID getRecordId() {
        return recordId;
    }

    public UUID getDraftId() {
        return draftId;
    }

    public void setDraftId(UUID draftId) {
        this.draftId = draftId;
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

    public InputMethod getSourceInputMethod() {
        return sourceInputMethod;
    }

    public void setSourceInputMethod(InputMethod sourceInputMethod) {
        this.sourceInputMethod = sourceInputMethod;
    }

    public ValidationStatus getValidationStatus() {
        return validationStatus;
    }

    public void setValidationStatus(ValidationStatus validationStatus) {
        this.validationStatus = validationStatus;
    }

    public String getDocumentNumber() {
        return documentNumber;
    }

    public void setDocumentNumber(String documentNumber) {
        this.documentNumber = documentNumber == null || documentNumber.isBlank()
                ? null
                : documentNumber.trim();
    }

    public java.util.List<String> getReferenceNumbers() {
        return referenceNumbers;
    }

    public void setReferenceNumbers(java.util.List<String> referenceNumbers) {
        this.referenceNumbers = referenceNumbers == null
                ? new java.util.ArrayList<>()
                : new java.util.ArrayList<>(referenceNumbers);
    }

    public com.trevora.api.features.serviceinput.DocumentType getDocumentType() {
        return documentType;
    }

    public void setDocumentType(com.trevora.api.features.serviceinput.DocumentType documentType) {
        this.documentType = documentType == null
                ? com.trevora.api.features.serviceinput.DocumentType.defaultType()
                : documentType;
    }

    public LocalDate getServiceDate() {
        return serviceDate;
    }

    public void setServiceDate(LocalDate serviceDate) {
        this.serviceDate = serviceDate;
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

    public BigDecimal getAmountCovered() {
        return amountCovered == null ? BigDecimal.ZERO : amountCovered;
    }

    public void setAmountCovered(BigDecimal amountCovered) {
        this.amountCovered = amountCovered == null ? BigDecimal.ZERO : amountCovered;
    }

    /**
     * What the owner actually paid: the invoice less whatever was covered.
     *
     * Derived rather than stored, so it cannot drift from the two numbers it
     * comes from. Never negative — the database constrains coverage to at most
     * the total, and this clamps rather than trusting that alone, because a
     * negative here would quietly subtract from the spend counter.
     */
    public BigDecimal getOwnerPaid() {
        BigDecimal paid = getTotalCost().subtract(getAmountCovered());
        return paid.signum() < 0 ? BigDecimal.ZERO : paid;
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

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
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
