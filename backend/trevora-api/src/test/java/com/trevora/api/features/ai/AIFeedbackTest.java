package com.trevora.api.features.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.servicerecord.ServiceRecord;
import com.trevora.api.features.servicerecord.ServiceRecordItemReader;
import com.trevora.api.features.servicerecord.ServiceRecordRepository;
import com.trevora.api.features.vehicle.VehicleService;
import com.trevora.api.shared.exception.ResourceNotFoundException;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AIFeedbackTest {

    private ServiceRecordRepository serviceRecordRepository;
    private ServiceRecordItemReader serviceRecordItemReader;
    private CurrentUserService currentUserService;
    private VehicleService vehicleService;
    private OpenAIExplanationProvider explanationProvider;
    private ServiceRecordExplanationRepository explanationRepository;
    private ServiceRecordAIFeedbackRepository feedbackRepository;
    private AIExplanationService service;

    private final UUID recordId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID vehicleId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        serviceRecordRepository = mock(ServiceRecordRepository.class);
        serviceRecordItemReader = mock(ServiceRecordItemReader.class);
        currentUserService = mock(CurrentUserService.class);
        vehicleService = mock(VehicleService.class);
        explanationProvider = mock(OpenAIExplanationProvider.class);
        explanationRepository = mock(ServiceRecordExplanationRepository.class);
        feedbackRepository = mock(ServiceRecordAIFeedbackRepository.class);

        when(currentUserService.getCurrentUserId()).thenReturn(userId);

        service = new AIExplanationService(
                serviceRecordRepository,
                serviceRecordItemReader,
                currentUserService,
                vehicleService,
                explanationProvider,
                explanationRepository,
                feedbackRepository
        );
    }

    @Test
    void submittingFeedbackSavesNewFeedbackWhenNoneExists() {
        ServiceRecord record = new ServiceRecord();
        record.setVehicleId(vehicleId);
        when(serviceRecordRepository.findByRecordIdAndOwnerId(recordId, userId))
                .thenReturn(Optional.of(record));
        when(feedbackRepository.findByRecordIdAndUserId(recordId, userId))
                .thenReturn(Optional.empty());
        when(feedbackRepository.save(any(ServiceRecordAIFeedback.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        AIFeedbackRequest request = new AIFeedbackRequest(false, "INACCURATE", "Parts were not replaced");
        AIFeedbackResponse response = service.submitFeedback(recordId, request, "en");

        assertThat(response.helpful()).isFalse();
        assertThat(response.reason()).isEqualTo("INACCURATE");
        assertThat(response.notes()).isEqualTo("Parts were not replaced");
        verify(feedbackRepository).save(any(ServiceRecordAIFeedback.class));
    }

    @Test
    void submittingFeedbackUpdatesExistingFeedbackInPlace() {
        ServiceRecord record = new ServiceRecord();
        record.setVehicleId(vehicleId);
        when(serviceRecordRepository.findByRecordIdAndOwnerId(recordId, userId))
                .thenReturn(Optional.of(record));

        ServiceRecordAIFeedback existing = new ServiceRecordAIFeedback(
                recordId, userId, false, "CONFUSING", null, "en");
        when(feedbackRepository.findByRecordIdAndUserId(recordId, userId))
                .thenReturn(Optional.of(existing));
        when(feedbackRepository.save(any(ServiceRecordAIFeedback.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        AIFeedbackRequest request = new AIFeedbackRequest(true, null, null);
        AIFeedbackResponse response = service.submitFeedback(recordId, request, "en");

        assertThat(response.helpful()).isTrue();
        assertThat(response.reason()).isNull();
        assertThat(existing.isHelpful()).isTrue();
    }

    @Test
    void submittingFeedbackForNonexistentRecordFails() {
        when(serviceRecordRepository.findByRecordIdAndOwnerId(recordId, userId))
                .thenReturn(Optional.empty());

        AIFeedbackRequest request = new AIFeedbackRequest(true, null, null);
        assertThatThrownBy(() -> service.submitFeedback(recordId, request, "en"))
                .isInstanceOf(ResourceNotFoundException.class);
    }
}
