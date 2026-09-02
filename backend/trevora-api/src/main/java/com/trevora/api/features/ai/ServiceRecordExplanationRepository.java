package com.trevora.api.features.ai;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Cached explanations, keyed by the record they explain.
 *
 * <p>No owner-scoped finders: nothing reaches this repository until
 * {@code AIExplanationService} has already loaded the record for the current
 * owner, so the id in hand is one the caller is entitled to.
 */
public interface ServiceRecordExplanationRepository extends JpaRepository<ServiceRecordExplanation, UUID> {
}
