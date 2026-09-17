import { getActiveCurrentUser } from './currentUser.js';

/**
 * The notification log kept in this browser, read and cleared by the
 * Notifications page.
 *
 * Nothing in the app writes to it any more. It held moments the backend never
 * records -- "your draft needs review", "the record saved" -- and those were
 * dropped as notifications; mechanic access requests are server state, which
 * the Notifications page asks the API for. It is still read so that entries an
 * earlier version stored keep showing until the owner clears them. They exist
 * only in the browser that stored them.
 */
export const LOCAL_NOTIFICATIONS_CHANGED_EVENT = 'trevora:local-notifications-changed';

function storageKey(userId) {
  return `trevora.localNotifications.${userId || 'anonymous'}`;
}

export function getLocalNotifications(userId = getActiveCurrentUser()?.userId) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey(userId)) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function clearLocalNotifications(userId = getActiveCurrentUser()?.userId) {
  window.localStorage.removeItem(storageKey(userId));
  window.dispatchEvent(new Event(LOCAL_NOTIFICATIONS_CHANGED_EVENT));
}
