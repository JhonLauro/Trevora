import React, { useEffect, useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, Check, Clock, UserRoundCheck } from 'lucide-react';
import Tabs from '../components/ink/Tabs.jsx';
import { formatDate } from '../utils/format.js';
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
import { usePendingAccessRequests } from '../hooks/usePendingAccessRequests.js';

/* The glyph is chosen from the category at render time rather than stored on
   the notification. The builders used to carry a literal character each —
   '!', '⏱' and '•' — which meant an exclamation mark in a circle standing in
   for "somebody wants to read your service history", and a bullet standing in
   for anything else. */
const CATEGORY_ICONS = {
  [NOTIFICATION_CATEGORIES.MECHANIC_REQUEST]: UserRoundCheck,
  [NOTIFICATION_CATEGORIES.TEMPORARY_EXPIRED]: Clock,
};

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
  if (diffMs < hour) {
    const mins = Math.floor(diffMs / minute);
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  if (diffMs < 7 * day) {
    const days = Math.floor(diffMs / day);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }

  return formatDate(value);
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
  const t = useT();
  const currentUser = getActiveCurrentUser();
  const [filter, setFilter] = useState('all');
  const [requests, setRequests] = useState([]);
  const [expiredSessions, setExpiredSessions] = useState([]);
  const [localEntries, setLocalEntries] = useState(() => getLocalNotifications(currentUser?.userId));
  const [preferences, setPreferences] = useState(getNotificationPreferences);
  const [readIds, setReadIds] = useState(() => loadReadNotificationIds(currentUser?.userId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /* The shell's shared poll. This page loads its own list -- it shows answered
     and expired items too -- but reloads it whenever the poll notices the
     pending set change, so a request that arrives while the page is open shows
     up without a refresh. */
  const pendingRequests = usePendingAccessRequests(true);
  const pendingSignature = pendingRequests.map((request) => request.mechanicAccessRequestId).join('|');

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
  }, [currentUser?.userId, pendingSignature]);

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

  const navigate = useNavigate();

  function markAsRead(id) {
    if (!id || readIds.has(id)) return;
    const nextReadIds = new Set(readIds);
    nextReadIds.add(id);
    setReadIds(nextReadIds);
    saveReadNotificationIds(currentUser?.userId, nextReadIds);
  }

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
    <main className="ink-page notif tv-reveal-group">
      <header className="notif__head">
        <div>
          <h1 className="notif__title">{t('notif.title')}</h1>
          <p className="notif__summary">
            {loading
              ? 'Loading…'
              : `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          className="notif__markread"
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0}
        >
          <Check size={16} aria-hidden="true" />
          {t('notif.markAllRead')}
        </button>
      </header>

      {error && <p className="notif__alert" role="alert">{error}</p>}

      <div className="notif__tabs-wrap">
        <Tabs
          label={t('notif.filter')}
          activeId={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: t('notif.tabAll'), count: notifications.length },
            { id: 'unread', label: t('notif.tabUnread'), count: unreadCount },
          ]}
        />
      </div>

      {loading ? (
        <section className="notif__card notif__empty">
          <h2 className="notif__empty-title">Loading…</h2>
        </section>
      ) : shown.length === 0 ? (
        <section className="notif__card notif__empty">
          <div className="notif__empty-icon" aria-hidden="true">
            <Bell size={28} />
          </div>
          <h2 className="notif__empty-title">
            {filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
          </h2>
          <p className="notif__empty-body">
            {t('notif.requestsArrive')}
          </p>
        </section>
      ) : (
        <div className="notif__card">
          <ul className="notif__list">
            {shown.map((notification) => {
              const Icon = CATEGORY_ICONS[notification.category] ?? Bell;
              return (
                <li
                  className={`notif-row${notification.unread ? ' is-unread' : ''}`}
                  key={notification.id}
                  onClick={() => {
                    if (notification.unread) markAsRead(notification.id);
                    if (notification.href) navigate(notification.href);
                  }}
                >
                  <span className="notif-row__indicator" aria-hidden="true">
                    {notification.unread && <span className="notif-row__dot" />}
                  </span>
                  <span className="notif-row__icon" aria-hidden="true">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <div className="notif-row__body">
                    <div className="notif-row__head">
                      <div className="notif-row__title-line">
                        <h2 className="notif-row__title">{notification.title}</h2>
                        {notification.unread && <span className="notif-row__badge">{t('notif.new')}</span>}
                      </div>
                      <span className="notif-row__time">{notification.time}</span>
                    </div>
                    <p className="notif-row__text">{notification.body}</p>
                    {notification.action && (
                      <Link
                        className="notif-row__action"
                        to={notification.href}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (notification.unread) markAsRead(notification.id);
                        }}
                      >
                        <span>{notification.action}</span>
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                  {notification.unread && (
                    <button
                      type="button"
                      className="notif-row__mark-btn"
                      title="Mark as read"
                      aria-label="Mark as read"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(notification.id);
                      }}
                    >
                      <Check size={15} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}
