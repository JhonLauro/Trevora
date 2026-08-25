// --- Three tiers, ranked by containment rather than by hue ---
//
// The design question this answers: Ink reserves chroma for record status, and
// the review screen has seven confidence states. Seven colours would either
// break that rule or invent a second meaning for colour.
//
// So urgency is carried by *containment* instead. A filled chip outranks an
// outline, an outline outranks bare text. Red appears on two states only — the
// two that stop a save — which is the one thing Ink already lets chroma mean.
// Read in greyscale the ladder still reads.
//
// The seven wordings are unchanged: they live in `fieldSignal` and are held to
// being identical on the review and confirm screens. This module only decides
// how loudly each one is drawn.

export const TIER_BLOCKING = 1;
export const TIER_REVIEW = 2;
export const TIER_SETTLED = 3;

/** The two labels that stop a save. Both come from `blocksConfirmation`. */
const BLOCKING_LABELS = new Set(['Needed to save', 'Cannot be right']);

/**
 * Which tier one field's signal belongs to.
 *
 * <p>Derived from the signal rather than re-read from the validation payload,
 * so the tier and the badge can never disagree — they are the same decision.
 *
 * @param signal the result of `fieldSignal`
 */
export function tierFor(signal) {
  if (!signal?.label) return TIER_SETTLED;
  if (BLOCKING_LABELS.has(signal.label)) return TIER_BLOCKING;
  // 'low' covers "Two different values found" and "Check this one"; 'medium' is
  // "Not on receipt". Everything below — source, high, owner — is provenance,
  // which describes where a value came from and asks for nothing.
  if (signal.status === 'low' || signal.status === 'medium') return TIER_REVIEW;
  return TIER_SETTLED;
}

/** True when this field is one of the things the owner is being asked to look at. */
export function isCounted(signal) {
  return tierFor(signal) !== TIER_SETTLED;
}

/**
 * The class suffix for a tier, used by `service-flow.css`.
 *
 * <p>Tier 3 gets no modifier at all: no chip, no rule, no border change.
 */
export function tierClass(tier) {
  if (tier === TIER_BLOCKING) return 'is-blocking';
  if (tier === TIER_REVIEW) return 'is-review';
  return '';
}
