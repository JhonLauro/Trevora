import { apiRequest } from './http';

export function createManualServiceDraft(draft) {
  return apiRequest('/service-drafts/manual', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

export function createReceiptServiceDraft({ vehicleId, receiptImage }) {
  const formData = new FormData();
  formData.append('vehicleId', vehicleId);
  formData.append('receiptImage', receiptImage);

  return apiRequest('/service-drafts/receipt', {
    method: 'POST',
    body: formData,
  });
}

export function createVoiceServiceDraft(draft) {
  return apiRequest('/service-drafts/voice', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

export function transcribeVoiceAudio({ vehicleId, audioFile }) {
  const formData = new FormData();
  formData.append('vehicleId', vehicleId);
  formData.append('audioFile', audioFile);

  return apiRequest('/service-drafts/voice/transcribe', {
    method: 'POST',
    body: formData,
  });
}

export function getServiceDraft(draftId) {
  return apiRequest(`/service-drafts/${draftId}`);
}

export function getServiceDraftReview(draftId) {
  return apiRequest(`/service-drafts/${draftId}/review`);
}

export function validateServiceDraft(draftId) {
  return apiRequest(`/service-drafts/${draftId}/validate`, {
    method: 'POST',
  });
}

export function updateServiceDraftCorrections(draftId, corrections) {
  return apiRequest(`/service-drafts/${draftId}/corrections`, {
    method: 'PATCH',
    body: JSON.stringify(corrections),
  });
}

export function confirmServiceDraft(draftId) {
  return apiRequest(`/service-drafts/${draftId}/confirm`, {
    method: 'POST',
  });
}
