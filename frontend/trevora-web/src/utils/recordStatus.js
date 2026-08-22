/**
 * Record validation status, and the words that go with it.
 *
 * The backend does not expose a validation status on confirmed records yet
 * (see planning/DEFERRED.md). Until it does, a record with no status is
 * "Needs review" — never "Validated". The previous dashboard hardcoded
 * "Validated" on every row, which told owners their unverified records had
 * been verified.
 */

export const STATUS_OK = 'ok';
export const STATUS_WARN = 'warn';

const VALIDATED_VALUES = new Set([
  'validated',
  'confirmed',
  'verified',
  'complete',
  'completed',
]);

export function recordStatus(record) {
  const raw = record?.validationStatus ?? record?.status;
  if (!raw) return STATUS_WARN;
  return VALIDATED_VALUES.has(String(raw).toLowerCase().replace(/_/g, ' ').trim())
    ? STATUS_OK
    : STATUS_WARN;
}

export function recordStatusLabel(record) {
  return recordStatus(record) === STATUS_OK ? 'Validated' : 'Needs review';
}

export function needsReview(record) {
  return recordStatus(record) === STATUS_WARN;
}

/**
 * Source is provenance, not a category. An explicit map, because title-casing
 * the raw enum produced "Receipt Upload" and "Voice Note" — machine words shown
 * to someone who never chose an enum.
 */
const SOURCE_LABELS = {
  RECEIPT: 'From receipt',
  RECEIPT_UPLOAD: 'From receipt',
  SCAN: 'From receipt',
  VOICE: 'Voice note',
  VOICE_NOTE: 'Voice note',
  MANUAL: 'Entered manually',
  MANUAL_ENTRY: 'Entered manually',
};

export function sourceLabel(value) {
  if (!value) return 'Entered manually';
  return SOURCE_LABELS[String(value).toUpperCase()] || 'Entered manually';
}
