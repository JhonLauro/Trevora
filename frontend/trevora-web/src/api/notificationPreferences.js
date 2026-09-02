/**
 * Notification preferences, and the categories they switch.
 *
 * These toggles used to be write-only: Account Settings saved them under
 * `trevora.notificationPreferences` and nothing ever read the key back, so
 * every switch was decorative. This module is the single place that owns them,
 * so the settings screen and the things that actually show notifications are
 * reading the same answer.
 *
 * Every notification anywhere in the app carries one of these category ids.
 * Adding a category means adding it here, and to `notificationRows` in Account
 * Settings -- a category with no switch would be unturnoffable, and a switch
 * with no category would be another decorative one.
 */
const STORAGE_KEY = 'trevora.notificationPreferences';

export const NOTIFICATION_PREFERENCES_CHANGED_EVENT = 'trevora:notification-preferences-changed';

/**
 * Four categories were removed after an audit, each for the same reason in a
 * different guise -- they announced something the owner had just watched
 * happen, or something the UI already said inline:
 *
 * - `recordSaved`: the owner pressed Confirm & Save and got a confirmation
 *   screen. A notification is a second announcement of a watched event.
 * - `missingFields`: inline form validation. The review page already marks the
 *   field and blocks the CTA.
 * - `mechanicDecision`: the owner approving or denying, told back to the owner.
 *   The mechanic learns the outcome by polling their own request page, so
 *   nothing was lost by dropping it.
 * - `aiUnavailable`: the record page already says the explanation is
 *   unavailable, in place.
 *
 * Stored preferences for removed keys are left alone rather than migrated:
 * `getNotificationPreferences` spreads defaults first, so a stale key is read
 * into an object nobody queries and disappears on the next save.
 */
export const NOTIFICATION_CATEGORIES = {
  MECHANIC_REQUEST: 'mechanicRequest',
  TEMPORARY_EXPIRED: 'temporaryExpired',
};

/** Categories that still exist, for dropping notifications stored under a
 *  category that has since been removed. */
export const KNOWN_NOTIFICATION_CATEGORIES = new Set(Object.values(NOTIFICATION_CATEGORIES));

/** On by default: someone who has never opened Settings should still be told
 *  a mechanic is asking for their service history. */
export const defaultNotificationPreferences = {
  mechanicRequest: true,
  temporaryExpired: true,
};

export function getNotificationPreferences() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...defaultNotificationPreferences, ...stored };
  } catch {
    return { ...defaultNotificationPreferences };
  }
}

export function saveNotificationPreferences(preferences) {
  const next = { ...defaultNotificationPreferences, ...preferences };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  // Lets the sidebar badge and an open Notifications page react to a switch
  // flipped in Settings without a reload.
  window.dispatchEvent(new Event(NOTIFICATION_PREFERENCES_CHANGED_EVENT));
  return next;
}

/**
 * An unknown category counts as enabled. A notification that exists but has no
 * matching switch should still reach the person it is about -- silently
 * dropping it would be the worse of the two failures.
 */
export function isNotificationEnabled(category, preferences = getNotificationPreferences()) {
  if (!category) return true;
  return preferences[category] !== false;
}

export function filterEnabledNotifications(notifications, preferences = getNotificationPreferences()) {
  return notifications.filter((item) => isNotificationEnabled(item.category, preferences));
}
