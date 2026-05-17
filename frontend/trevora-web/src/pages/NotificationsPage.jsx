import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const notifications = [
  {
    icon: '▢',
    tone: 'blue',
    title: 'Mechanic Access Request',
    body: 'Juan Santos from Superior Auto Repairs has requested access to Toyota Vios 2021 service history.',
    time: '10 minutes ago',
    action: 'Review Request',
    href: '/access/requests',
    unread: true,
  },
  {
    icon: '▤',
    tone: 'orange',
    title: 'Draft Needs Review',
    body: "Your voice-recorded service draft for 'Air Filter Replacement' has missing fields and needs review before saving.",
    time: '2 hours ago',
    action: 'Review Draft',
    href: '/vehicles',
    unread: true,
  },
  {
    icon: '✓',
    tone: 'green',
    title: 'Service Record Saved',
    body: 'Oil Change + Brake Service record for Toyota Vios 2021 has been successfully validated and saved.',
    time: '2 days ago',
    action: 'View Record',
    href: '/dashboard',
    unread: false,
  },
  {
    icon: '△',
    tone: 'red',
    title: 'Missing Required Fields',
    body: "The service draft for 'Tire Rotation' is missing vehicle profile and total cost. Please complete before saving.",
    time: '3 days ago',
    action: 'Fix Fields',
    href: '/vehicles',
    unread: false,
  },
  {
    icon: '✓',
    tone: 'green',
    title: 'Mechanic Access Approved',
    body: "You approved Maria Garcia's access to Honda Civic 2019 service history. Access expires in 30 minutes.",
    time: '1 week ago',
    action: '',
    href: '',
    unread: false,
  },
  {
    icon: '×',
    tone: 'red',
    title: 'Mechanic Access Denied',
    body: 'Access request from an unknown service center was denied. No records were shared.',
    time: '1 week ago',
    action: '',
    href: '',
    unread: false,
  },
  {
    icon: '◷',
    tone: 'gray',
    title: 'Temporary Access Expired',
    body: "Maria Garcia's read-only access to Honda Civic 2019 has expired. All access has been revoked.",
    time: '1 week ago',
    action: '',
    href: '',
    unread: false,
  },
  {
    icon: '✣',
    tone: 'purple',
    title: 'AI Explanation Unavailable',
    body: 'The AI explanation for your recent record is temporarily unavailable. Your record has been saved and is accessible.',
    time: '2 weeks ago',
    action: '',
    href: '',
    unread: false,
  },
];

export default function NotificationsPage() {
  const [filter, setFilter] = useState('all');
  const shown = filter === 'unread' ? notifications.filter((item) => item.unread) : notifications;

  return (
    <main className="page-shell notifications-page">
      <section className="notifications-header">
        <div>
          <h1>Notifications</h1>
          <p>2 unread notifications</p>
        </div>
        <button className="button-link-secondary" type="button">
          ✓ Mark all read
        </button>
      </section>

      <div className="notification-tabs">
        <button className={filter === 'all' ? 'active' : ''} type="button" onClick={() => setFilter('all')}>
          All (8)
        </button>
        <button className={filter === 'unread' ? 'active' : ''} type="button" onClick={() => setFilter('unread')}>
          Unread (2)
        </button>
      </div>

      <section className="notification-page-list">
        {shown.map((notification) => (
          <article className={notification.unread ? 'notification-page-card unread' : 'notification-page-card'} key={notification.title}>
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
                  {notification.action} →
                </Link>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
