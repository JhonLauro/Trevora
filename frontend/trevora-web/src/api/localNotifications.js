import { getActiveCurrentUser } from './currentUser.js';

/**
 * Notifications for things that happen inside this app and leave no trace on
 * the server to read back.
 *
 * Mechanic access requests are server state -- the Notifications page derives
 * those by asking the API what the requests are. But "your draft needs
 * review", "the record saved", "the AI explanation was unavailable" are
 * moments, not rows: nothing on the backend records that they happened, so
 * there is nothing to derive them from later. They are captured here, at the
 * moment they occur.
 *
 * The consequence worth knowing: these live in this browser. A record saved on
 * a laptop does not raise a notification on a phone. Moving them across
 * devices means a notifications table and endpoints on the backend, which is a
 * larger change than making the switches work.
 */
const MAX_STORED = 50;

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

/**
 * @param dedupeKey identifies the underlying event, so the same draft opened
 *     three times raises one notification rather than three. A repeat replaces
 *     the earlier entry instead of stacking on it.
 */
export function recordLocalNotification({ category, title, body, action, href, dedupeKey }) {
  try {
    const userId = getActiveCurrentUser()?.userId;
    if (!userId) return null;

    const id = dedupeKey ? `local:${category}:${dedupeKey}` : `local:${category}:${Date.now()}`;
    const entry = {
      id,
      category,
      title,
      body,
      action,
      href,
      createdAt: new Date().toISOString(),
    };

    const existing = getLocalNotifications(userId).filter((item) => item.id !== id);
    const next = [entry, ...existing].slice(0, MAX_STORED);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
    window.dispatchEvent(new Event(LOCAL_NOTIFICATIONS_CHANGED_EVENT));
    return entry;
  } catch {
    // A notification is never worth failing the action that caused it: a
    // full localStorage must not turn a saved service record into an error.
    return null;
  }
}

/**
 * Takes back a notification whose reason has passed.
 *
 * A draft raises "needs review" when it is created; confirming it makes that
 * false. Without this the list kept both the stale prompt and the confirmed
 * record, and the prompt still linked to a draft that no longer needed
 * anything -- the notification outlived the thing it was about.
 *
 * Identity is rebuilt from the same category and dedupe key the entry was
 * written with, so callers never have to know the id format.
 */
export function dismissLocalNotification({ category, dedupeKey }) {
  try {
    const userId = getActiveCurrentUser()?.userId;
    if (!userId || !dedupeKey) return;

    const id = `local:${category}:${dedupeKey}`;
    const existing = getLocalNotifications(userId);
    const next = existing.filter((item) => item.id !== id);
    if (next.length === existing.length) return;

    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
    window.dispatchEvent(new Event(LOCAL_NOTIFICATIONS_CHANGED_EVENT));
  } catch {
    // Same reasoning as recording one: never fail the action over its notice.
  }
}

export function clearLocalNotifications(userId = getActiveCurrentUser()?.userId) {
  window.localStorage.removeItem(storageKey(userId));
  window.dispatchEvent(new Event(LOCAL_NOTIFICATIONS_CHANGED_EVENT));
}
