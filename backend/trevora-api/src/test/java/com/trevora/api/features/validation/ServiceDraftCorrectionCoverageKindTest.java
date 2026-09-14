package com.trevora.api.features.validation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.serviceinput.ServiceDraft;
import com.trevora.api.features.serviceinput.ServiceDraftRepository;
import com.trevora.api.features.serviceinput.ServiceInputService;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The coverage kind travels with the covered amount and never outlives it.
 *
 * <p>Switching the coverage toggle off sends a zero amount. A kind left behind
 * on that draft would say "covered by insurance" about a bill nobody covered,
 * and the database refuses the pair outright (migration 028), so the save
 * would fail instead of the owner's change landing.
 */
class ServiceDraftCorrectionCoverageKindTest {

    private ServiceDraft draft;
    private ServiceDraftCorrectionService service;

    @BeforeEach
    void setUp() {
        ServiceInputService inputs = mock(ServiceInputService.class);
        ServiceDraftRepository drafts = mock(ServiceDraftRepository.class);
        draft = new ServiceDraft();
        when(inputs.getDraftForCurrentUser(any())).thenReturn(draft);
        when(drafts.save(any(ServiceDraft.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service = new ServiceDraftCorrectionService(
                inputs, drafts, mock(ServiceDraftValidationService.class), mock(CurrentUserService.class));
    }

    private static ServiceDraftCorrectionRequest request(String covered, String kind) {
        return new ServiceDraftCorrectionRequest(
                null, null, null, new BigDecimal("256.79"),
                covered == null ? null : new BigDecimal(covered), kind, null, null, null);
    }

    @Test
    void keepsTheKindTheOwnerPickedAlongsideAnAmount() {
        service.correctDraft(UUID.randomUUID(), request("56.79", "INSURANCE"));

        assertThat(draft.getAmountCovered()).isEqualByComparingTo("56.79");
        assertThat(draft.getCoverageKind()).isEqualTo("INSURANCE");
    }

    @Test
    void dropsTheKindWhenNothingIsCovered() {
        draft.setCoverageKind("WARRANTY");

        service.correctDraft(UUID.randomUUID(), request("0", "WARRANTY"));
        assertThat(draft.getCoverageKind()).isNull();

        service.correctDraft(UUID.randomUUID(), request(null, "WARRANTY"));
        assertThat(draft.getCoverageKind()).isNull();
    }

    @Test
    void notSureIsNull() {
        service.correctDraft(UUID.randomUUID(), request("56.79", null));

        assertThat(draft.getAmountCovered()).isEqualByComparingTo("56.79");
        assertThat(draft.getCoverageKind()).isNull();
    }
}
