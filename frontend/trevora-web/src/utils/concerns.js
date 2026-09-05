/**
 * Open versus resolved, decided once.
 *
 * The rule is trivial — `resolvedAt == null` — and that is exactly why it was
 * worth extracting. It is read by the tab badge, the stat cell, the panel, and
 * the confirmation prompt, and four copies of a trivial rule is how the
 * category vocabulary ended up with four definitions that disagreed.
 */

/** Open concerns, newest first as the API returns them. */
export function openConcerns(concerns) {
  return (Array.isArray(concerns) ? concerns : []).filter((concern) => !concern?.resolvedAt);
}

export function resolvedConcerns(concerns) {
  return (Array.isArray(concerns) ? concerns : []).filter((concern) => concern?.resolvedAt);
}

/**
 * What the tab badge and the stat cell both count.
 *
 * Open only. A resolved concern is history, not something waiting on the owner,
 * and counting it would make the number go up when they dealt with something.
 */
export function openConcernCount(concerns) {
  return openConcerns(concerns).length;
}

/** Whether the confirmation screen has anything to ask about. */
export function hasOpenConcerns(concerns) {
  return openConcernCount(concerns) > 0;
}
