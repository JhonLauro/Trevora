import { apiRequest } from './http';
import { removeStoredReceipt, uploadReceiptPages } from './receiptStorage';

export function createManualServiceDraft(draft) {
  return apiRequest('/service-drafts/manual', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

export async function createReceiptServiceDraft({ vehicleId, receiptImage }) {
  return createReceiptPagesServiceDraft({
    vehicleId,
    pages: [{ file: receiptImage, pageNumber: 1 }],
    receiptInputMode: 'UPLOAD',
  });
}

/**
 * Stores the pages, then sends them for reading.
 *
 * <p>Each file crosses the network twice and no more: once to Supabase
 * Storage, where it stays so the owner can look at the receipt again, and once
 * to the API, which runs OCR over the bytes rather than fetching them back.
 * A single-page receipt used to make the trip three times — it was appended as
 * `receiptImage` as well as `receiptImages`, and the server prefers the latter
 * and drops the former. On a 4 MB phone photo that was 4 MB of upload spent to
 * be discarded, on the slowest step in the flow.
 *
 * @param onProgress called with a { stage, storedPages, totalPages } object at
 *     each real transition. There are two stages because there are two things
 *     happening, not because four reads better.
 */
export async function createReceiptPagesServiceDraft({ vehicleId, pages, receiptInputMode, onProgress }) {
  onProgress?.({ stage: 'STORING', storedPages: 0, totalPages: pages.length });
  const storedPages = await uploadReceiptPages({
    vehicleId,
    pages,
    onPageStored: (storedCount, totalCount) =>
      onProgress?.({ stage: 'STORING', storedPages: storedCount, totalPages: totalCount }),
  });
  const primaryPage = storedPages[0];
  const formData = new FormData();
  formData.append('vehicleId', vehicleId);
  formData.append('receiptInputMode', receiptInputMode || 'UPLOAD');
  pages.forEach((page) => {
    formData.append('receiptImages', page.file ?? page);
  });
  if (primaryPage) {
    formData.append('receiptStorageBucket', primaryPage.bucket);
    formData.append('receiptStoragePath', primaryPage.path);
    formData.append('receiptOriginalFilename', primaryPage.originalFilename);
    formData.append('receiptContentType', primaryPage.contentType);
    formData.append('receiptPagesJson', JSON.stringify(storedPages));
  }

  try {
    onProgress?.({ stage: 'READING', storedPages: storedPages.length, totalPages: pages.length });
    return await apiRequest('/service-drafts/receipt', {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    await Promise.all(storedPages.map((page) => removeStoredReceipt(page)));
    throw error;
  }
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

export function translateVoiceTranscript({ vehicleId, transcript }) {
  return apiRequest('/service-drafts/voice/translate', {
    method: 'POST',
    body: JSON.stringify({ vehicleId, transcript }),
  });
}

export function getServiceDraft(draftId) {
  return apiRequest(`/service-drafts/${draftId}`);
}

export function getServiceDraftReview(draftId) {
  return apiRequest(`/service-drafts/${draftId}/review`).then(normalizeDraftValidationPayload);
}

export function updateServiceDraftCorrections(draftId, corrections) {
  return apiRequest(`/service-drafts/${draftId}/corrections`, {
    method: 'PATCH',
    body: JSON.stringify(corrections),
  }).then(normalizeDraftValidationPayload);
}

export function confirmServiceDraft(draftId) {
  return apiRequest(`/service-drafts/${draftId}/confirm`, {
    method: 'POST',
  }).then(normalizeDraftValidationPayload);
}

function normalizeDraftValidationPayload(payload) {
  if (!payload) return payload;
  if (payload.validation) {
    return {
      ...payload,
      validation: normalizeValidation(payload.validation),
    };
  }
  if (Array.isArray(payload.missingRequiredFields) || Array.isArray(payload.flaggedFields)
      || Array.isArray(payload.invalidFields)) {
    return normalizeValidation(payload);
  }
  return payload;
}

/**
 * Fills in the lists so callers can map over them without guarding.
 *
 * Deliberately does not touch `valid`. It used to recompute it from
 * `missingRequiredFields.length`, which is a second definition of "ready to
 * confirm" living on the client — it happened to agree with the server's, and
 * silently would not have once plausibility errors started blocking.
 */
function normalizeValidation(validation) {
  return {
    ...validation,
    missingRequiredFields: validation.missingRequiredFields ?? [],
    invalidFields: validation.invalidFields ?? [],
    flaggedFields: validation.flaggedFields ?? [],
  };
}

