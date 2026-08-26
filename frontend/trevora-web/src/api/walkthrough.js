/**
 * Whether this owner has been shown the onboarding walkthrough.
 *
 * <p>The answer lives on `users` (migration 014) and is reached through the
 * backend, never localStorage: it has to survive a different device, a
 * different browser and a cleared cache, and this is a flow that gets demoed.
 *
 * <p>Both calls fail soft. This sits in the middle of signup, and a walkthrough
 * that will not load is not a reason to strand somebody between creating an
 * account and adding their vehicle.
 */
import { apiRequest } from './http.js';

/**
 * True when the walkthrough has already been shown.
 *
 * <p>An unreachable API answers `false` -- showing it a second time is a
 * annoyance, and the alternative, skipping it on a network blink, is the whole
 * feature not happening for that account.
 */
export async function hasSeenWalkthrough() {
  try {
    const profile = await apiRequest('/auth/me');
    return Boolean(profile?.walkthroughCompletedAt);
  } catch {
    return false;
  }
}

/**
 * Records that it has been shown. Called by both the skip link and the final
 * CTA, and safe to call twice -- the server keeps the first timestamp.
 */
export async function markWalkthroughSeen() {
  try {
    await apiRequest('/auth/me/walkthrough/seen', { method: 'POST' });
    return true;
  } catch {
    // The owner still moves on. Worst case they see the walkthrough once more.
    return false;
  }
}
