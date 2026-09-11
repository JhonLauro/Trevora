package com.trevora.api.features.serviceinput;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trevora.api.features.auth.CurrentUserService;
import com.trevora.api.features.vehicle.VehicleProfile;
import com.trevora.api.features.vehicle.VehicleService;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

/**
 * Sending the same receipt photos again opens the draft they already made, and pays
 * Google Vision and OpenAI nothing.
 */
class ReceiptUploadReuseTest {

    private static MultipartFile page(String name, String content) {
        return new MockMultipartFile("receiptImages", name, "image/jpeg", content.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("the same pages give the same fingerprint, whatever the files are called")
    void samePagesSameFingerprint() {
        String first = ReceiptUploadFingerprints.fingerprintOf(List.of(page("IMG_1.jpg", "page one"), page("IMG_2.jpg", "page two")));
        String again = ReceiptUploadFingerprints.fingerprintOf(List.of(page("copy.jpg", "page one"), page("other.jpg", "page two")));

        assertThat(first).isNotBlank().isEqualTo(again);
    }

    @Test
    @DisplayName("different bytes, a different page order, or pages split differently are different uploads")
    void differentUploadsDiffer() {
        String original = ReceiptUploadFingerprints.fingerprintOf(List.of(page("a.jpg", "page one"), page("b.jpg", "page two")));

        assertThat(ReceiptUploadFingerprints.fingerprintOf(List.of(page("a.jpg", "page one"), page("b.jpg", "page 2"))))
                .isNotEqualTo(original);
        assertThat(ReceiptUploadFingerprints.fingerprintOf(List.of(page("b.jpg", "page two"), page("a.jpg", "page one"))))
                .isNotEqualTo(original);
        assertThat(ReceiptUploadFingerprints.fingerprintOf(List.of(page("a.jpg", "page onepage two"))))
                .isNotEqualTo(original);
    }

    @Test
    @DisplayName("an upload with no pages has no fingerprint, so it is never mistaken for another")
    void noPagesNoFingerprint() {
        assertThat(ReceiptUploadFingerprints.fingerprintOf(List.of())).isNull();
        assertThat(ReceiptUploadFingerprints.fingerprintOf(null)).isNull();
    }

    @Test
    @DisplayName("re-sending pages whose draft is still open returns that draft and reads nothing")
    void reuploadReturnsTheExistingDraftWithoutReading() {
        UUID ownerId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID existingDraftId = UUID.randomUUID();

        ServiceDraftRepository drafts = mock(ServiceDraftRepository.class);
        VehicleService vehicles = mock(VehicleService.class);
        OCRProcessingService ocr = mock(OCRProcessingService.class);
        CurrentUserService currentUser = mock(CurrentUserService.class);
        ReceiptUploadFingerprints fingerprints = mock(ReceiptUploadFingerprints.class);

        when(currentUser.getCurrentUserId()).thenReturn(ownerId);
        when(vehicles.verifyVehicleBelongsToCurrentUser(vehicleId)).thenReturn(mock(VehicleProfile.class));
        when(fingerprints.reusableDraft(any(), any(), anyString())).thenReturn(Optional.of(existingDraftId));
        ServiceDraft existing = new ServiceDraft();
        when(drafts.findByDraftIdAndOwnerId(existingDraftId, ownerId)).thenReturn(Optional.of(existing));

        ServiceInputService service = new ServiceInputService(
                drafts,
                mock(ServiceDraftItemRepository.class),
                mock(ServiceDraftLineEntryRepository.class),
                vehicles,
                ocr,
                mock(VoiceProcessingService.class),
                currentUser,
                new ObjectMapper(),
                new ServiceClassificationService(),
                fingerprints);

        ServiceInputService.ReceiptDraftOutcome outcome = service.createOrReuseReceiptDraft(
                vehicleId, List.of(page("IMG_1.jpg", "page one")), "UPLOAD", null, null, null, null, null);

        assertThat(outcome.reused()).isTrue();
        assertThat(outcome.draft()).isSameAs(existing);
        verify(ocr, never()).extractReceiptFields(any(), anyString(), any());
        verify(drafts, never()).save(any());
    }
}
