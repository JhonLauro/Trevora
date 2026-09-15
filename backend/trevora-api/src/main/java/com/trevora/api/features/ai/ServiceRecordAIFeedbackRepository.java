package com.trevora.api.features.ai;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Storage for owner feedback on AI explanations.
 */
public interface ServiceRecordAIFeedbackRepository extends JpaRepository<ServiceRecordAIFeedback, UUID> {
    Optional<ServiceRecordAIFeedback> findByRecordIdAndUserId(UUID recordId, UUID userId);
    long countByHelpful(boolean helpful);
}
