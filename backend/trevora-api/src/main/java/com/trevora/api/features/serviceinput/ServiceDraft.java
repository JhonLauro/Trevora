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
import java.util.ArrayList;
import java.util.List;
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

    /**
     * What kind of paper this draft was read off.
     *
     * <p>Not null and defaulted, so drafts created before this column existed
     * keep their cost rather than being reinterpreted as estimates.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "document_type", nullable = false)
    private DocumentType documentType = DocumentType.defaultType();

    /**
     * The document's own printed reference, and the documents it points at.
     *
     * <p>Kept as columns rather than in {@code fieldMetadata} because they are
     * answers, not diagnostics. The number a service centre prints is the key
     * to that shop's own system: an owner who can quote it gets back everything
     * the dealership recorded and this app never saw. Null and empty are normal
     * - a small shop prints neither.
     */
    @Column(name = "document_number")
    private String documentNumber;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "reference_numbers", columnDefinition = "jsonb")
    private List<String> referenceNumbers = new ArrayList<>();

    @Column(name = "service_date")
    private LocalDate serviceDate;

    private Integer odometer;

    @Column(name = "total_cost", precision = 12, scale = 2)
    private BigDecimal totalCost;

    /**
     * What insurance or a warranty absorbed of {@link #totalCost}. Zero when
     * nothing was covered, never null.
     *
     * A receipt cannot show this, so it is never extracted — it is only ever
     * entered by the owner in the review step.
     */
    @Column(name = "amount_covered", nullable = false, precision = 12, scale = 2)
    private BigDecimal amountCovered = BigDecimal.ZERO;

    @Column(name = "shop_name")
    private String shopName;

    private String location;

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

    public String getDocumentNumber() {
        return documentNumber;
    }

    public void setDocumentNumber(String documentNumber) {
        this.documentNumber = documentNumber == null || documentNumber.isBlank()
                ? null
                : documentNumber.trim();
    }

    public List<String> getReferenceNumbers() {
        return referenceNumbers;
    }

    public void setReferenceNumbers(List<String> referenceNumbers) {
        this.referenceNumbers = referenceNumbers == null ? new ArrayList<>() : new ArrayList<>(referenceNumbers);
    }

    public DocumentType getDocumentType() {
        return documentType;
    }

    public void setDocumentType(DocumentType documentType) {
        this.documentType = documentType == null ? DocumentType.defaultType() : documentType;
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
