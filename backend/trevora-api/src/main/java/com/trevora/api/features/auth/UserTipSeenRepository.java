package com.trevora.api.features.auth;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserTipSeenRepository extends JpaRepository<UserTipSeen, UserTipSeen.Key> {
    /** Every tip this owner has dismissed. One query, on page load. */
    List<UserTipSeen> findByUserId(UUID userId);
}
