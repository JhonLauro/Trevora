package com.trevora.api.features.vehicle;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * A partial vehicle edit: only the fields the caller actually sent.
 *
 * <p><b>Why this is a mutable class in a codebase of records.</b> The whole
 * point of PATCH is telling three cases apart:
 *
 * <pre>
 *   {}                          the caller did not mention this field
 *   {"warrantyMonths": null}    the caller is clearing this field
 *   {"warrantyMonths": 36}      the caller is setting this field
 * </pre>
 *
 * <p>A record cannot express the first. Jackson passes {@code null} to the
 * canonical constructor for a missing component, which is the same value an
 * explicit null produces — and the difference matters here, because emptying a
 * warranty term is a legitimate edit rather than a no-op.
 *
 * <p>{@code Optional<T>} does not rescue it either. That was tried and probed
 * against this project's own ObjectMapper before this class was written:
 * absent and explicit-null <i>both</i> deserialize to {@code Optional.empty()}.
 * Building on that would have shipped an endpoint where a field could be set
 * but never cleared, and nothing would have failed to say so.
 *
 * <p>So: a setter per field, and Jackson calls a setter only for a key that is
 * present — including one whose value is null. Each setter records that it ran.
 * That is the entire mechanism, and it needs no dependency and no custom
 * deserializer.
 *
 * <p>Validation annotations still work, and they are all null-tolerant on
 * purpose: {@code @Min} and {@code @PastOrPresent} pass on null, so an absent
 * field and a cleared one are both accepted here. What may <i>not</i> be
 * cleared — make and model are NOT NULL columns — is enforced in
 * {@link VehicleService}, where business rules live and where the presence set
 * can be consulted.
 */
public class PatchVehicleRequest {

    /**
     * Which keys the JSON body actually carried.
     *
     * <p>Insertion-ordered so an error message about the first bad field names
     * them in the order they were sent, which is the order the caller wrote
     * them.
     */
    private final Set<String> provided = new LinkedHashSet<>();

    // A blank make or model is rejected outright rather than trimmed to null:
    // the columns are NOT NULL, and " " is not a correction anybody meant.
    // @Pattern rather than @NotBlank because @NotBlank rejects null, which
    // would make an absent field an error.
    @Pattern(regexp = ".*\\S.*", message = "Make cannot be blank.")
    private String make;

    @Pattern(regexp = ".*\\S.*", message = "Model cannot be blank.")
    private String model;

    @Pattern(
            regexp = "sedan|hatchback|suv|mpv|pickup|van|scooter|underbone|motorcycle",
            message = "Body type must be one of: sedan, hatchback, suv, mpv, pickup, van, scooter, underbone, motorcycle"
    )
    private String bodyType;

    private String nickname;
    private String plateNumber;
    private String vinChassisNumber;

    @Min(1886)
    private Integer year;

    @Min(0)
    private Integer odometer;

    private String photoBucket;
    private String photoPath;

    @PastOrPresent(message = "A purchase or delivery date cannot be in the future.")
    private LocalDate warrantyStartDate;

    @Min(value = 1, message = "Enter the coverage period in months, or leave it blank.")
    @Max(value = 600, message = "That looks like days rather than months — enter the coverage period in months.")
    private Integer warrantyMonths;

    @Min(value = 1, message = "Enter the mileage limit in kilometres, or leave it blank.")
    @Max(value = 2000000, message = "That mileage limit looks like a typo. Enter it in kilometres.")
    private Integer warrantyKmLimit;

    /** Whether the body carried this key at all, whatever its value. */
    public boolean has(String field) {
        return provided.contains(field);
    }

    /** True when the body carried nothing this endpoint knows how to apply. */
    public boolean isEmpty() {
        return provided.isEmpty();
    }

    public Set<String> providedFields() {
        return Set.copyOf(provided);
    }

    public String getMake() {
        return make;
    }

    public void setMake(String make) {
        this.make = make;
        provided.add("make");
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
        provided.add("model");
    }

    public String getBodyType() {
        return bodyType;
    }

    public void setBodyType(String bodyType) {
        this.bodyType = bodyType;
        provided.add("bodyType");
    }

    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
        provided.add("nickname");
    }

    public String getPlateNumber() {
        return plateNumber;
    }

    public void setPlateNumber(String plateNumber) {
        this.plateNumber = plateNumber;
        provided.add("plateNumber");
    }

    public String getVinChassisNumber() {
        return vinChassisNumber;
    }

    public void setVinChassisNumber(String vinChassisNumber) {
        this.vinChassisNumber = vinChassisNumber;
        provided.add("vinChassisNumber");
    }

    public Integer getYear() {
        return year;
    }

    public void setYear(Integer year) {
        this.year = year;
        provided.add("year");
    }

    public Integer getOdometer() {
        return odometer;
    }

    public void setOdometer(Integer odometer) {
        this.odometer = odometer;
        provided.add("odometer");
    }

    public String getPhotoBucket() {
        return photoBucket;
    }

    public void setPhotoBucket(String photoBucket) {
        this.photoBucket = photoBucket;
        provided.add("photoBucket");
    }

    public String getPhotoPath() {
        return photoPath;
    }

    public void setPhotoPath(String photoPath) {
        this.photoPath = photoPath;
        provided.add("photoPath");
    }

    public LocalDate getWarrantyStartDate() {
        return warrantyStartDate;
    }

    public void setWarrantyStartDate(LocalDate warrantyStartDate) {
        this.warrantyStartDate = warrantyStartDate;
        provided.add("warrantyStartDate");
    }

    public Integer getWarrantyMonths() {
        return warrantyMonths;
    }

    public void setWarrantyMonths(Integer warrantyMonths) {
        this.warrantyMonths = warrantyMonths;
        provided.add("warrantyMonths");
    }

    public Integer getWarrantyKmLimit() {
        return warrantyKmLimit;
    }

    public void setWarrantyKmLimit(Integer warrantyKmLimit) {
        this.warrantyKmLimit = warrantyKmLimit;
        provided.add("warrantyKmLimit");
    }
}
