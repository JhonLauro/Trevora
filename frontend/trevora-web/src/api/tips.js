import { apiRequest } from './http.js';

/**
 * Which in-app tips this owner has already been dismissed.
 *
 * <p>Server-side for the same reason the walkthrough flag is: a tip that is
 * "shown once" has to stay shown-once on the owner's laptop after they met it
 * on their phone. localStorage would re-run the whole guide on every device.
 *
 * <p>Loaded once per page load and held here. A tip fires on arriving at a
 * screen, so a request per screen would put a round trip in front of every
 * navigation for something that changes about five times in an account's life.
 */
let pending = null;

/**
 * Fails to "everything has been seen", which shows no tips at all.
 *
 * <p>The opposite default would run the entire guide again for an owner of two
 * years the first time their connection wobbled. A tip is worth nothing if it
 * arrives at the wrong moment, so silence is the safe failure here.
 */
export function loadSeenTips() {
  if (!pending) {
    pending = apiRequest('/auth/me/tips')
      .then((keys) => new Set(Array.isArray(keys) ? keys : []))
      .catch(() => null);
  }
  return pending;
}

/**
 * Records a tip as dismissed, locally first.
 *
 * <p>Local first because the guide moves on immediately: waiting on the round
 * trip means the next screen's tip decision reads state that has not been
 * updated, and a slow network could show a tip that was just dismissed. The
 * request is fire-and-forget for the same reason -- if it fails, the worst
 * case is seeing one tip again on the next visit.
 */
export async function markTipSeen(tipKey) {
  const seen = await loadSeenTips();
  if (seen) {
    seen.add(tipKey);
  }
  apiRequest(`/auth/me/tips/${encodeURIComponent(tipKey)}/seen`, { method: 'POST' })
    .catch(() => {});
}
