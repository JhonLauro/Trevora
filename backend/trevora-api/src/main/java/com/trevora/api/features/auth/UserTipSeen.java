package com.trevora.api.features.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * One tip one owner has dismissed.
 *
 * <p>The presence of a row is the whole meaning: this account has seen this
 * tip and must not be shown it again. `seenAt` is kept for the same reason the
 * walkthrough keeps a timestamp rather than a boolean -- "when" is the question
 * that gets asked later, and it costs the same.
 *
 * <p>No entity describes a tip. Its copy, its anchor and the screen it belongs
 * to live in the frontend registry; the server only records that somebody has
 * been shown one. See migration 022.
 */
@Entity
@Table(name = "user_tips_seen")
@IdClass(UserTipSeen.Key.class)
public class UserTipSeen {
    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Id
    @Column(name = "tip_key")
    private String tipKey;

    @Column(name = "seen_at", nullable = false)
    private Instant seenAt;

    protected UserTipSeen() {
    }

    UserTipSeen(UUID userId, String tipKey, Instant seenAt) {
        this.userId = userId;
        this.tipKey = tipKey;
        this.seenAt = seenAt;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getTipKey() {
        return tipKey;
    }

    public Instant getSeenAt() {
        return seenAt;
    }

    /** The composite primary key: one row per owner per tip. */
    public static class Key implements Serializable {
        private UUID userId;
        private String tipKey;

        public Key() {
        }

        public Key(UUID userId, String tipKey) {
            this.userId = userId;
            this.tipKey = tipKey;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof Key key)) {
                return false;
            }
            return Objects.equals(userId, key.userId) && Objects.equals(tipKey, key.tipKey);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, tipKey);
        }
    }
}
