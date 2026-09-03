import { apiRequest } from './http';
import { removeStoredReceipt, uploadReceiptPages } from './receiptStorage';

/*
 * There was a "your draft needs review" notification raised here, on every
 * input method. It is gone, along with the pairing it belonged to.
 *
 * Creating a draft navigates straight into that draft, so the notice arrived
 * announcing the screen its reader was already looking at. It then sat in the
 * list until confirmation quietly took it back — a round trip whose only
 * visible effect was a line telling somebody to do what they were doing.
 *
 * Nothing is lost with it: the Garage counts what still needs review, and an
 * unconfirmed draft is reachable from the vehicle it belongs to.
 */

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

/**
 * Every draft this owner started and has not confirmed, newest first.
 *
 * <p>There was no way back to a draft except the review screen's URL. Leaving
 * that screen -- which "Save and finish later" invites you to do -- stored the
 * work and then showed it nowhere.
 *
 * <p>Rows are summaries, not whole drafts: the list needs a date, a total and
 * a shop to be recognisable, not every service line behind them.
 */
export function listServiceDrafts() {
  return apiRequest('/service-drafts');
}

export function getServiceDraft(draftId) {
  return apiRequest(`/service-drafts/${draftId}`);
}

/**
 * A review request started before the screen that needs it exists.
 *
 * <p>The receipt flow knows the draft id about two seconds before the review
 * screen mounts — it spends them playing the hand-off transition. Without
 * this, that whole animation is dead time and the request only starts once it
 * ends, so the transition lands on "Loading…" instead of on the screen it just
 * promised. Priming spends the animation on the request instead.
 *
 * <p>It is deliberately a single slot, consumed once and never refilled on
 * read. A draft is editable, so a cache that answered twice would eventually
 * hand somebody the version from before their own corrections — the bug this
 * is not worth. Nothing changes for callers that never prime.
 */
let primedReview = null;

/** How long a primed request stays usable. Longer than the transition it was
 *  started under, short enough that an abandoned one is never served. */
const PRIMED_REVIEW_TTL_MS = 30000;

export function primeServiceDraftReview(draftId) {
  const request = fetchServiceDraftReview(draftId);
  // No one is awaiting this yet, and an unhandled rejection between now and
  // the consumer arriving is noise, not a failure: `getServiceDraftReview`
  // below refetches rather than surfacing it.
  request.catch(() => {});
  primedReview = { draftId, request, primedAt: Date.now() };
}

export function getServiceDraftReview(draftId) {
  const primed = primedReview;
  primedReview = null;

  const usable = primed
    && primed.draftId === draftId
    && Date.now() - primed.primedAt < PRIMED_REVIEW_TTL_MS;

  if (!usable) return fetchServiceDraftReview(draftId);

  // A primed request that failed is not an answer. The owner never asked for
  // it and cannot retry it, so a real one is made instead of showing them an
  // error from a request they did not make.
  return primed.request.catch(() => fetchServiceDraftReview(draftId));
}

function fetchServiceDraftReview(draftId) {
  return apiRequest(`/service-drafts/${draftId}/review`).then(normalizeDraftValidationPayload);
}

export function updateServiceDraftCorrections(draftId, corrections) {
  return apiRequest(`/service-drafts/${draftId}/corrections`, {
    method: 'PATCH',
    body: JSON.stringify(corrections),
  }).then(normalizeDraftValidationPayload);
}

/**
 * Throws a draft away.
 *
 * <p>For the receipt that turns out to belong to another vehicle. Without it
 * the owner is sent to scan again and the mistaken draft stays behind, still
 * counted in the Garage's "needs review" and still asking to be finished.
 */
export function deleteServiceDraft(draftId) {
  return apiRequest(`/service-drafts/${encodeURIComponent(draftId)}`, {
    method: 'DELETE',
  });
}

export function confirmServiceDraft(draftId) {
  return apiRequest(`/service-drafts/${draftId}/confirm`, {
    method: 'POST',
  })
    .then(normalizeDraftValidationPayload);
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

