import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getActiveCurrentUser } from '../api/currentUser.js';
import { getMechanicAccessRequests } from '../api/qrAccess';

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

function buildNotification(request, readIds) {
  const id = request.mechanicAccessRequestId;
  const status = String(request.status || '').toUpperCase();
  const mechanic = request.mechanicName || 'A mechanic';
  const shop = request.shopName ? ` from ${request.shopName}` : '';
  const vehicle = request.vehicleLabel || 'your vehicle';
  const unread = status === 'PENDING' && !readIds.has(id);

  if (status === 'APPROVED') {
    return {
      id,
      icon: '✓',
      tone: 'green',
      title: 'Mechanic access approved',
      body: `${mechanic}${shop} was approved for temporary read-only access to ${vehicle}.`,
      time: formatTime(request.decidedAt || request.requestedAt),
      action: 'View access requests',
      href: '/access/requests',
      unread: false,
    };
  }

  if (status === 'DENIED') {
    return {
      id,
      icon: '!',
      tone: 'red',
      title: 'Mechanic access denied',
      body: `${mechanic}${shop} was denied access to ${vehicle}. No service records were shared.`,
      time: formatTime(request.decidedAt || request.requestedAt),
      action: 'View access requests',
      href: '/access/requests',
      unread: false,
    };
  }

  return {
    id,
    icon: '!',
    tone: 'blue',
    title: 'Mechanic access request',
    body: `${mechanic}${shop} requested temporary read-only access to ${vehicle}.`,
    time: formatTime(request.requestedAt),
    action: 'Review request',
    href: '/access/requests',
    unread,
  };
}

export default function NotificationsPage() {
  const currentUser = getActiveCurrentUser();
  const [filter, setFilter] = useState('all');
  const [requests, setRequests] = useState([]);
  const [readIds, setReadIds] = useState(() => loadReadNotificationIds(currentUser?.userId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setReadIds(loadReadNotificationIds(currentUser?.userId));

    getMechanicAccessRequests('')
      .then((data) => {
        if (active) setRequests(data);
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

  const notifications = requests.map((request) => buildNotification(request, readIds));
  const unreadCount = notifications.filter((item) => item.unread).length;
  const shown = filter === 'unread' ? notifications.filter((item) => item.unread) : notifications;

  function markAllRead() {
    const nextReadIds = new Set(readIds);
    requests
      .filter((request) => String(request.status || '').toUpperCase() === 'PENDING')
      .forEach((request) => nextReadIds.add(request.mechanicAccessRequestId));
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
