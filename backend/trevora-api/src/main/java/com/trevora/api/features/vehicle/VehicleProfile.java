package com.trevora.api.features.vehicle;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "vehicle_profiles")
public class VehicleProfile {
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "vehicle_id")
    private UUID vehicleId;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false)
    private String make;

    @Column(nullable = false)
    private String model;

    @Column(name = "model_year")
    private Integer year;

    private String nickname;

    @Column(name = "plate_number")
    private String plateNumber;

    @Column(name = "vin_chassis_number")
    private String vinChassisNumber;

    private Integer odometer;

    /**
     * Vehicle silhouette, used by the parts map. Filled in from the make/model
     * catalogue when the model is known, asked for otherwise. Nullable: rows
     * created before the picker existed have no honest value, and back-filling
     * one would be inventing it rather than recording it.
     */
    @Column(name = "body_type")
    private String bodyType;

    /* Where the owner's photo of this vehicle lives, if there is one. The
       bucket is stored beside the path rather than assumed, because the
       frontend reads its bucket name from an env var and a changed value must
       not orphan every existing row. Never a URL: the bucket is private, so
       what the app renders is a signed URL that expires. See migration 015. */
    @Column(name = "photo_bucket")
    private String photoBucket;

    @Column(name = "photo_path")
    private String photoPath;

    /**
     * Manufacturer warranty terms, as the owner read them off their own
     * paperwork. See migration 024.
     *
     * <p><b>All three are independently nullable, and that is the feature.</b>
     * The common case is an owner holding half the answer: the booklet says
     * "3 years or 100,000 km" while the delivery date is on paperwork they no
     * longer have. Demanding all three to record any would throw away the half
     * they know, so the read side reports a partial answer as partial rather
     * than as a confident yes or no.
     *
     * <p>Nothing derived is stored beside them — no computed expiry, no
     * status. A computed expiry could contradict the start date and period it
     * came from the moment either was corrected, which is the rule 010 already
     * applied to out-of-pocket cost. {@code WarrantyStatusResolver} computes
     * status on read. {@link #warrantyExpiryDate} is not an exception to this:
     * it holds an end date a document printed, not one worked out here.
     *
     * <p>None of this has been checked with a dealer. It is what the owner
     * typed, and every screen that shows it has to say so.
     */
    @Column(name = "warranty_start_date")
    private LocalDate warrantyStartDate;

    @Column(name = "warranty_months")
    private Integer warrantyMonths;

    @Column(name = "warranty_km_limit")
    private Integer warrantyKmLimit;

    /**
     * The warranty end date as a document prints it (migration 029). When set
     * it wins over start date + months, because dealers count from
     * registration, round to month ends or extend on promotion, and the paper
     * is right where our arithmetic is not.
     *
     * <p><b>A receipt's Delivery Date is never the warranty start.</b> Dealer
     * stock and demo units are delivered to the dealer long before a customer
     * buys them, and cover starts at the sale or registration. The two happen
     * to match on some receipts, which is exactly what makes copying one into
     * the other look safe. Only a date printed as the warranty start counts.
     */
    @Column(name = "warranty_expiry_date")
    private LocalDate warrantyExpiryDate;

    /**
     * Who supplied the warranty fields: {@code OWNER} or {@code RECEIPT}.
     * Null when no terms are recorded. A null is never shown as either one.
     */
    @Column(name = "warranty_source")
    private String warrantySource;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getVehicleId() {
        return vehicleId;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(UUID ownerId) {
        this.ownerId = ownerId;
    }

    public String getMake() {
        return make;
    }

    public void setMake(String make) {
        this.make = make;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public Integer getYear() {
        return year;
    }

    public void setYear(Integer year) {
        this.year = year;
    }

    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }

    public String getPlateNumber() {
        return plateNumber;
    }

    public void setPlateNumber(String plateNumber) {
        this.plateNumber = plateNumber;
    }

    public String getVinChassisNumber() {
        return vinChassisNumber;
    }

    public void setVinChassisNumber(String vinChassisNumber) {
        this.vinChassisNumber = vinChassisNumber;
    }

    public Integer getOdometer() {
        return odometer;
    }

    public LocalDate getWarrantyStartDate() {
        return warrantyStartDate;
    }

    public void setWarrantyStartDate(LocalDate warrantyStartDate) {
        this.warrantyStartDate = warrantyStartDate;
    }

    public Integer getWarrantyMonths() {
        return warrantyMonths;
    }

    public void setWarrantyMonths(Integer warrantyMonths) {
        this.warrantyMonths = warrantyMonths;
    }

    public Integer getWarrantyKmLimit() {
        return warrantyKmLimit;
    }

    public void setWarrantyKmLimit(Integer warrantyKmLimit) {
        this.warrantyKmLimit = warrantyKmLimit;
    }

    public LocalDate getWarrantyExpiryDate() {
        return warrantyExpiryDate;
    }

    public void setWarrantyExpiryDate(LocalDate warrantyExpiryDate) {
        this.warrantyExpiryDate = warrantyExpiryDate;
    }

    public String getWarrantySource() {
        return warrantySource;
    }

    public void setWarrantySource(String warrantySource) {
        this.warrantySource = warrantySource;
    }

    public String getBodyType() {
        return bodyType;
    }

    public String getPhotoBucket() {
        return photoBucket;
    }

    public String getPhotoPath() {
        return photoPath;
    }

    public boolean hasPhoto() {
        return photoPath != null && !photoPath.isBlank();
    }

    public void setBodyType(String bodyType) {
        this.bodyType = bodyType;
    }

    /** Both halves move together: a path without its bucket cannot be read
        back, and a bucket without a path points at nothing. Clearing one
        clears the other. */
    public void setPhoto(String photoBucket, String photoPath) {
        boolean cleared = photoPath == null || photoPath.isBlank();
        this.photoPath = cleared ? null : photoPath;
        this.photoBucket = cleared ? null : photoBucket;
    }

    public void setOdometer(Integer odometer) {
        this.odometer = odometer;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
