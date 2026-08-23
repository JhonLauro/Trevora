package com.trevora.api.features.serviceinput;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "service_draft_items")
public class ServiceDraftItem {
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "item_id")
    private UUID itemId;

    @Column(name = "draft_id", nullable = false)
    private UUID draftId;

    @Column(name = "service_type", nullable = false)
    private String serviceType;

    @Column(name = "service_category")
    private String serviceCategory;

    @Column(name = "parts_replaced", columnDefinition = "text")
    private String partsReplaced;

    @Column(name = "labor_performed", columnDefinition = "text")
    private String laborPerformed;

    @Column(name = "line_cost", precision = 12, scale = 2)
    private BigDecimal lineCost;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "field_metadata", columnDefinition = "jsonb")
    private Map<String, Object> fieldMetadata;

    /**
     * The receipt lines under this item.
     *
     * <p>{@code @Transient} and populated by the loader, not by JPA. The app
     * runs with {@code spring.jpa.open-in-view=false}, so a lazy
     * {@code @OneToMany} would throw the moment a controller serialised a
     * response outside the transaction; every other entity here is flat with
     * explicit UUID keys for the same reason.
     *
     * <p>Hydration is {@code ServiceInputService.getItemsForDraft}'s job and happens on every
     * read path, so this is empty only when the item genuinely has no lines.
     */
    @Transient
    private List<ServiceDraftLineEntry> lineEntries = List.of();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getItemId() {
        return itemId;
    }

    public UUID getDraftId() {
        return draftId;
    }

    public void setDraftId(UUID draftId) {
        this.draftId = draftId;
    }

    public String getServiceType() {
        return serviceType;
    }

    public void setServiceType(String serviceType) {
        this.serviceType = serviceType;
    }

    public String getServiceCategory() {
        return serviceCategory;
    }

    public void setServiceCategory(String serviceCategory) {
        this.serviceCategory = serviceCategory;
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

    public BigDecimal getLineCost() {
        return lineCost;
    }

    public void setLineCost(BigDecimal lineCost) {
        this.lineCost = lineCost;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }

    public Map<String, Object> getFieldMetadata() {
        return fieldMetadata;
    }

    public void setFieldMetadata(Map<String, Object> fieldMetadata) {
        this.fieldMetadata = fieldMetadata;
    }

    public List<ServiceDraftLineEntry> getLineEntries() {
        return lineEntries;
    }

    public void setLineEntries(List<ServiceDraftLineEntry> lineEntries) {
        this.lineEntries = lineEntries == null ? List.of() : List.copyOf(lineEntries);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
