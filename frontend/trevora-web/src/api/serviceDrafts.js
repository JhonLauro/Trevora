import { apiRequest } from './http';
import { NOTIFICATION_CATEGORIES } from './notificationPreferences.js';
import { dismissLocalNotification, recordLocalNotification } from './localNotifications.js';
import { removeStoredReceipt, uploadReceiptPages } from './receiptStorage';

/**
 * Nothing on the backend records that a draft was created or confirmed, so
 * these two moments are captured here, where every input method (manual,
 * receipt, voice) passes through, rather than in each of the three pages.
 */
function announceDraftCreated(draft) {
  const draftId = draft?.serviceDraftId ?? draft?.draftId ?? draft?.id;
  if (!draftId) return draft;
  recordLocalNotification({
    category: NOTIFICATION_CATEGORIES.DRAFT_REVIEW,
    title: 'Service draft needs review',
    body: 'A service draft is waiting for you to check what was read from it.',
    action: 'Review draft',
    href: `/service-drafts/${draftId}`,
    dedupeKey: draftId,
  });
  return draft;
}

export function createManualServiceDraft(draft) {
  return apiRequest('/service-drafts/manual', {
    method: 'POST',
    body: JSON.stringify(draft),
  }).then(announceDraftCreated);
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
    return announceDraftCreated(await apiRequest('/service-drafts/receipt', {
      method: 'POST',
      body: formData,
    }));
  } catch (error) {
    await Promise.all(storedPages.map((page) => removeStoredReceipt(page)));
    throw error;
  }
}

export function createVoiceServiceDraft(draft) {
  return apiRequest('/service-drafts/voice', {
    method: 'POST',
    body: JSON.stringify(draft),
  }).then(announceDraftCreated);
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

export function confirmServiceDraft(draftId) {
  return apiRequest(`/service-drafts/${draftId}/confirm`, {
    method: 'POST',
  })
    .then(normalizeDraftValidationPayload)
    .then((result) => {
      // The draft no longer needs reviewing, so its prompt is taken back.
      // Otherwise the list kept pointing at a draft that was already filed.
      dismissLocalNotification({
        category: NOTIFICATION_CATEGORIES.DRAFT_REVIEW,
        dedupeKey: draftId,
      });
      return result;
    });
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

