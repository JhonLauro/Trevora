import { apiRequest } from './http.js';
import { getVehicles } from './vehicles.js';

/**
 * Where a signed-in owner is allowed to be: the walkthrough, then the first
 * vehicle, then the app.
 *
 * <p>Both answers come from the server, not localStorage, for the same reason
 * the walkthrough flag does — a new account has to look new on a second device
 * and after a cleared cache.
 *
 * <p>Cached for the life of the page. Without it every route change costs two
 * requests before anything renders, which on a cold backend is the difference
 * between a slow app and an unusable one. `clearOnboardingCache()` is called
 * at the two moments the answer changes: finishing the walkthrough, and saving
 * the first vehicle.
 */
let pending = null;

export function clearOnboardingCache() {
  pending = null;
}

/**
 * Records a step as done without asking the server again.
 *
 * <p>Clearing the cache instead would race: finishing the walkthrough fires
 * `POST /walkthrough/seen` without waiting on it, so a refetch triggered in the
 * same breath can read the profile from before the write. The gate would then
 * send the owner back to the walkthrough they just completed, and back again,
 * for as long as the two requests kept crossing.
 *
 * <p>Optimistic on purpose: the server is the record, this is only what stops
 * the router arguing with a user who has already done the thing.
 */
export function markOnboardingStep(patch) {
  const previous = pending ?? Promise.resolve({ walkthroughDone: true, hasVehicle: true });
  pending = previous.then((state) => ({ ...state, ...patch }));
}

/**
 * Failure is treated as "let them in", deliberately.
 *
 * <p>This gate exists to guide a new owner through onboarding in order, not to
 * enforce anything — the backend authorises every request on its own and does
 * not care what the browser believes. So the cost of the two possible wrong
 * answers is not symmetric: guessing "already onboarded" during a network
 * blink shows somebody a page that then loads its own error, while guessing
 * "still onboarding" locks an owner of four years out of their own garage and
 * into a walkthrough, with no way past it now that it cannot be skipped.
 *
 * <p>Note this is the opposite of `hasSeenWalkthrough()`, which fails to
 * `false` because showing the walkthrough twice is harmless when it is
 * skippable. Once it is not skippable, that same default becomes a trap.
 */
export function loadOnboardingState() {
  if (!pending) {
    pending = Promise.all([
      apiRequest('/auth/me').catch(() => null),
      getVehicles().catch(() => null),
    ]).then(([profile, vehicles]) => ({
      walkthroughDone: profile == null ? true : Boolean(profile.walkthroughCompletedAt),
      hasVehicle: vehicles == null ? true : vehicles.length > 0,
    }));
  }
  return pending;
}
