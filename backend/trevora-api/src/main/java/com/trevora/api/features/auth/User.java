package com.trevora.api.features.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "users")
public class User {
    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name", nullable = false)
    private String lastName;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String role;

    @Column(name = "password_hash")
    private String passwordHash;

    /* Null until the owner has been shown the onboarding walkthrough. A
       timestamp rather than a boolean so "seen it before or after the
       walkthrough changed" stays answerable. See migration 014.

       `walkthrough_furthest_step` exists in the database and is deliberately
       not mapped: this feature shows the walkthrough once and does not resume
       it, and an unmapped column is invisible to ddl-auto=validate. */
    @Column(name = "walkthrough_completed_at")
    private Instant walkthroughCompletedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getUserId() {
        return userId;
    }

    public String getFullName() {
        String displayName = buildFullName();
        return displayName.isBlank() ? fullName : displayName;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public String getEmail() {
        return email;
    }

    public String getRole() {
        return role;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Instant getWalkthroughCompletedAt() {
        return walkthroughCompletedAt;
    }

    public boolean hasSeenWalkthrough() {
        return walkthroughCompletedAt != null;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
        syncFullName();
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
        syncFullName();
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    /** Write-once. The first time wins and every later call is ignored, so a
        second tab, a retried request or a re-mounted page cannot move the
        timestamp -- and, more to the point, cannot make an owner who has
        already seen the walkthrough look like one who has not. */
    public void markWalkthroughSeen(Instant seenAt) {
        if (walkthroughCompletedAt == null) {
            walkthroughCompletedAt = seenAt;
        }
    }

    public String normalizedRole() {
        if ("OWNER".equals(role)) {
            return "VEHICLE_OWNER";
        }
        return role;
    }

    private String buildFullName() {
        return String.join(" ", firstName == null ? "" : firstName.trim(), lastName == null ? "" : lastName.trim()).trim();
    }

    private void syncFullName() {
        String displayName = buildFullName();
        if (!displayName.isBlank()) {
            this.fullName = displayName;
        }
    }
}
