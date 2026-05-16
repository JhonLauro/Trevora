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

export function getServiceDraft(draftId) {
  return apiRequest(`/service-drafts/${draftId}`);
}
