import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getActiveCurrentUser } from '../api/currentUser.js';
import { LOCAL_NOTIFICATIONS_CHANGED_EVENT, getLocalNotifications } from '../api/localNotifications.js';
import {
  KNOWN_NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PREFERENCES_CHANGED_EVENT,
  filterEnabledNotifications,
  getNotificationPreferences,
} from '../api/notificationPreferences.js';
import { getMechanicAccessRequests, getOwnerMechanicAccessSessions } from '../api/qrAccess';

function notificationStorageKey(userId) {
  return `trevora.readNotifications.${userId || 'anonymous'}`;
}

function loadReadNotificationIds(userId) {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(notificationStorageKey(userId)) || '[]'));
  } catch {
    return new Set();
  }
}

function saveReadNotificationIds(userId, ids) {
  window.localStorage.setItem(notificationStorageKey(userId), JSON.stringify([...ids]));
}

function formatTime(value) {
  if (!value) return 'Recently';

  const timestamp = new Date(value).getTime();
  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} minutes ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} hours ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} days ago`;

  return new Date(value).toLocaleDateString();
}

/**
 * Only pending requests become notifications. Approved and denied used to as
 * well, until an audit pointed out the obvious: the owner is the one who
 * approves or denies, so it told them about their own action. The mechanic --
 * who does want to know -- learns the outcome by polling their own request
 * page, and never sees this list at all.
 */
function buildNotification(request, readIds) {
  const id = request.mechanicAccessRequestId;
  const mechanic = request.mechanicName || 'A mechanic';
  const shop = request.shopName ? ` from ${request.shopName}` : '';
  const vehicle = request.vehicleLabel || 'your vehicle';

  return {
    id,
    icon: '!',
    tone: 'blue',
    category: NOTIFICATION_CATEGORIES.MECHANIC_REQUEST,
    title: 'Mechanic access request',
    body: `${mechanic}${shop} requested temporary read-only access to ${vehicle}.`,
    time: formatTime(request.requestedAt),
    sortAt: request.requestedAt,
    action: 'Review request',
    href: '/access/requests',
    unread: !readIds.has(id),
  };
}

/**
 * The switch for this one had nothing behind it: an expired session simply
 * stopped working and said nothing. Expiry is not an event the backend
 * announces, but it is derivable -- a session whose `expiresAt` has passed is
 * an expiry that happened.
 */
function buildExpiredSessionNotification(session, readIds) {
  const id = `session-expired:${session.mechanicAccessSessionId}`;
  const mechanic = session.mechanicName || 'A mechanic';
  const shop = session.shopName ? ` from ${session.shopName}` : '';
  return {
    id,
    category: NOTIFICATION_CATEGORIES.TEMPORARY_EXPIRED,
    icon: '⏱',
    tone: 'grey',
    title: 'Temporary access expired',
    body: `${mechanic}${shop} can no longer see ${session.vehicleLabel || 'your vehicle'}. Their temporary access has ended.`,
    time: formatTime(session.expiresAt),
    action: 'View shared access',
    href: '/access/requests',
    unread: !readIds.has(id),
    sortAt: session.expiresAt,
  };
}

function buildLocalNotification(entry, readIds) {
  return {
    id: entry.id,
    category: entry.category,
    icon: '•',
    tone: 'blue',
    title: entry.title,
    body: entry.body,
    time: formatTime(entry.createdAt),
    action: entry.action,
    href: entry.href,
    unread: !readIds.has(entry.id),
    sortAt: entry.createdAt,
  };
}

export default function NotificationsPage() {
  const currentUser = getActiveCurrentUser();
  const [filter, setFilter] = useState('all');
  const [requests, setRequests] = useState([]);
  const [expiredSessions, setExpiredSessions] = useState([]);
  const [localEntries, setLocalEntries] = useState(() => getLocalNotifications(currentUser?.userId));
  const [preferences, setPreferences] = useState(getNotificationPreferences);
  const [readIds, setReadIds] = useState(() => loadReadNotificationIds(currentUser?.userId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setReadIds(loadReadNotificationIds(currentUser?.userId));
    setLocalEntries(getLocalNotifications(currentUser?.userId));

    Promise.all([
      getMechanicAccessRequests(''),
      // Expiry is not an error worth surfacing: if this call fails the page
      // still shows everything else rather than nothing.
      getOwnerMechanicAccessSessions('').catch(() => []),
    ])
      .then(([requestData, sessionData]) => {
        if (!active) return;
        setRequests(requestData);
        const now = Date.now();
        setExpiredSessions(
          (Array.isArray(sessionData) ? sessionData : []).filter(
            (session) => session.expiresAt && new Date(session.expiresAt).getTime() <= now,
          ),
        );
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentUser?.userId]);

  // A switch flipped in Settings, or an event raised on another tab, should be
  // reflected here without a reload.
  useEffect(() => {
    const syncPreferences = () => setPreferences(getNotificationPreferences());
    const syncLocal = () => setLocalEntries(getLocalNotifications(currentUser?.userId));
    window.addEventListener(NOTIFICATION_PREFERENCES_CHANGED_EVENT, syncPreferences);
    window.addEventListener(LOCAL_NOTIFICATIONS_CHANGED_EVENT, syncLocal);
    return () => {
      window.removeEventListener(NOTIFICATION_PREFERENCES_CHANGED_EVENT, syncPreferences);
      window.removeEventListener(LOCAL_NOTIFICATIONS_CHANGED_EVENT, syncLocal);
    };
  }, [currentUser?.userId]);

  const notifications = filterEnabledNotifications(
    [
      ...requests
        .filter((request) => String(request.status || '').toUpperCase() === 'PENDING')
        .map((request) => buildNotification(request, readIds)),
      ...expiredSessions.map((session) => buildExpiredSessionNotification(session, readIds)),
      ...localEntries
        // A removed category leaves entries behind in localStorage.
        // `isNotificationEnabled` treats an unknown category as enabled --
        // right for a notification whose switch does not exist yet, wrong for
        // one whose switch is gone -- so they are dropped here instead.
        .filter((entry) => KNOWN_NOTIFICATION_CATEGORIES.has(entry.category))
        .map((entry) => buildLocalNotification(entry, readIds)),
    ],
    preferences,
  ).sort((a, b) => new Date(b.sortAt || 0) - new Date(a.sortAt || 0));
  const unreadCount = notifications.filter((item) => item.unread).length;
  const shown = filter === 'unread' ? notifications.filter((item) => item.unread) : notifications;

  function markAllRead() {
    // Reads the rendered list rather than the requests array: expired sessions
    // and locally raised events are unread notifications too, and the old
    // version left them unread forever while claiming to have cleared them.
    const nextReadIds = new Set(readIds);
    notifications.filter((item) => item.unread).forEach((item) => nextReadIds.add(item.id));
    setReadIds(nextReadIds);
    saveReadNotificationIds(currentUser?.userId, nextReadIds);
  }

  return (
    <main className="page-shell notifications-page">
      <section className="notifications-header">
        <div>
          <h1>Notifications</h1>
          <p>{loading ? 'Loading notifications...' : `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}</p>
        </div>
        <button className="button-link-secondary" type="button" onClick={markAllRead} disabled={unreadCount === 0}>
          Mark all read
        </button>
      </section>

      {error && <div className="alert">{error}</div>}

      <div className="notification-tabs">
        <button className={filter === 'all' ? 'active' : ''} type="button" onClick={() => setFilter('all')}>
          All ({notifications.length})
        </button>
        <button className={filter === 'unread' ? 'active' : ''} type="button" onClick={() => setFilter('unread')}>
          Unread ({unreadCount})
        </button>
      </div>

      <section className="notification-page-list">
        {loading ? (
          <section className="notification-empty-state">
            <h2>Loading notifications...</h2>
          </section>
        ) : shown.length === 0 ? (
          <section className="notification-empty-state">
            <h2>{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</h2>
            <p>Mechanic access requests for your vehicles will appear here.</p>
          </section>
        ) : (
          shown.map((notification) => (
            <article className={notification.unread ? 'notification-page-card unread' : 'notification-page-card'} key={notification.id}>
              <span className={`notification-icon ${notification.tone}`}>{notification.icon}</span>
              <div>
                <div className="notification-title-row">
                  <h2>
                    {notification.title}
                    {notification.unread && <span className="unread-dot" />}
                  </h2>
                  <small>{notification.time}</small>
                </div>
                <p>{notification.body}</p>
                {notification.action && (
                  <Link className="inline-link" to={notification.href}>
                    {notification.action}
                  </Link>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
