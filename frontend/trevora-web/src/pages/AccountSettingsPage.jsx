import React, { useState } from 'react';
import { clearLoggedInUser, getActiveCurrentUser, getUserDisplayName, setLoggedInUser } from '../api/currentUser';

const settingsNav = [
  { id: 'profile', icon: '⌾', label: 'Profile Information' },
  { id: 'security', icon: '▣', label: 'Password & Security' },
  { id: 'notifications', icon: '♧', label: 'Notification Preferences' },
  { id: 'privacy', icon: '◇', label: 'Privacy & Access History' },
  { id: 'sessions', icon: '◷', label: 'Active Shared Sessions' },
];

const initialNotificationPrefs = {
  draftReview: true,
  missingFields: true,
  recordSaved: true,
  mechanicRequest: true,
  mechanicDecision: true,
  temporaryExpired: true,
  aiUnavailable: true,
};

const accessHistory = [
  {
    title: 'Maria Garcia - QuickFix Motors',
    detail: 'Honda Civic 2019 - 1 week ago',
    status: 'Expired',
  },
  {
    title: 'Unknown - Denied',
    detail: 'Toyota Vios 2021 - 1 week ago',
    status: 'Denied',
  },
  {
    title: 'Pedro Reyes - AutoPro',
    detail: 'Toyota Vios 2021 - 3 weeks ago',
    status: 'Expired',
  },
];

function splitName(fullName) {
  const parts = String(fullName || 'Juan dela Cruz').split(' ');
  return {
    firstName: parts[0] || 'Juan',
    lastName: parts.slice(1).join(' ') || 'dela Cruz',
  };
}

function initials(firstName, lastName) {
  return `${firstName?.[0] || 'J'}${lastName?.[0] || 'D'}`.toUpperCase();
}

export default function AccountSettingsPage() {
  const currentUser = getActiveCurrentUser();
  const name = currentUser?.firstName || currentUser?.lastName
    ? { firstName: currentUser?.firstName || '', lastName: currentUser?.lastName || '' }
    : splitName(getUserDisplayName(currentUser));
  const [activeTab, setActiveTab] = useState('profile');
  const [form, setForm] = useState({
    firstName: name.firstName,
    lastName: name.lastName,
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [notificationPrefs, setNotificationPrefs] = useState(initialNotificationPrefs);
  const [savedMessage, setSavedMessage] = useState('');
  const [activeSession, setActiveSession] = useState(true);

  function updateField(event) {
    const { name: fieldName, value } = event.target;
    setForm((current) => ({ ...current, [fieldName]: value }));
    setSavedMessage('');
  }

  function updatePasswordField(event) {
    const { name: fieldName, value } = event.target;
    setPasswordForm((current) => ({ ...current, [fieldName]: value }));
    setSavedMessage('');
  }

  function saveProfile(event) {
    event.preventDefault();
    const updatedUser = {
      ...currentUser,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      fullName: `${form.firstName} ${form.lastName}`.trim(),
      email: form.email,
      phone: form.phone,
    };
    setLoggedInUser(updatedUser);
    setSavedMessage('Profile changes saved for this browser session.');
  }

  function updatePassword(event) {
    event.preventDefault();
    if (!passwordForm.newPassword || passwordForm.newPassword !== passwordForm.confirmPassword) {
      setSavedMessage('New password and confirmation must match.');
      return;
    }
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setSavedMessage('Password update saved for this session.');
  }

  function togglePreference(key) {
    setNotificationPrefs((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function handleSignOut() {
    clearLoggedInUser();
    window.location.assign('/login');
  }

  return (
    <main className="page-shell account-settings-page">
      <section className="page-header">
        <h1>Account Settings</h1>
        <p>Manage your account preferences and security</p>
      </section>

      <section className="account-settings-layout">
        <aside className="settings-menu">
          {settingsNav.map((item) => (
            <button
              className={activeTab === item.id ? 'active' : ''}
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setSavedMessage('');
              }}
            >
              <span>{item.icon}</span>
              {item.label}
              <span>›</span>
            </button>
          ))}
          <button className="danger" type="button" onClick={handleSignOut}>
            <span>↪</span>
            Sign Out
          </button>
        </aside>

        {activeTab === 'profile' && (
          <article className="settings-card">
            <h2>Profile Information</h2>
            <p>Update your personal details</p>

            <div className="settings-profile-heading">
              <span className="settings-avatar">{initials(form.firstName, form.lastName)}</span>
              <div>
                <strong>{`${form.firstName} ${form.lastName}`}</strong>
                <small>Vehicle Owner</small>
                <button type="button">Change photo</button>
              </div>
            </div>

            <form className="settings-form" onSubmit={saveProfile}>
              <div className="settings-form-grid">
                <label>
                  First Name
                  <input name="firstName" value={form.firstName} onChange={updateField} />
                </label>
                <label>
                  Last Name
                  <input name="lastName" value={form.lastName} onChange={updateField} />
                </label>
              </div>
              <label>
                Email Address
                <input name="email" type="email" value={form.email} onChange={updateField} />
              </label>
              <label>
                Phone Number
                <input name="phone" value={form.phone} onChange={updateField} />
              </label>
              {savedMessage && <div className="success-banner">{savedMessage}</div>}
              <div className="settings-actions">
                <button type="submit">Save Changes</button>
              </div>
            </form>
          </article>
        )}

        {activeTab === 'security' && (
          <article className="settings-card">
            <h2>Password & Security</h2>
            <p>Change your password to keep your account secure</p>

            <form className="settings-form password-settings-form" onSubmit={updatePassword}>
              <label>
                Current Password
                <span className="password-input-wrap">
                  <input
                    name="currentPassword"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={updatePasswordField}
                  />
                  <span>⊙</span>
                </span>
              </label>
              <label>
                New Password
                <span className="password-input-wrap">
                  <input
                    name="newPassword"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={updatePasswordField}
                  />
                  <span>⊙</span>
                </span>
              </label>
              <label>
                Confirm New Password
                <span className="password-input-wrap">
                  <input
                    name="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={updatePasswordField}
                  />
                  <span>⊙</span>
                </span>
              </label>
              {savedMessage && <div className="success-banner">{savedMessage}</div>}
              <div className="settings-actions">
                <button type="submit">Update Password</button>
              </div>
            </form>
          </article>
        )}

        {activeTab === 'notifications' && (
          <article className="settings-card">
            <h2>Notification Preferences</h2>
            <p>Choose which notifications you'd like to receive</p>

            <div className="settings-list">
              {[
                ['draftReview', 'Service draft needs review'],
                ['missingFields', 'Missing required fields'],
                ['recordSaved', 'Service record saved'],
                ['mechanicRequest', 'Mechanic requested access'],
                ['mechanicDecision', 'Mechanic access approved/denied'],
                ['temporaryExpired', 'Temporary access expired'],
                ['aiUnavailable', 'AI explanation unavailable'],
              ].map(([key, label]) => (
                <button className="settings-row" key={key} type="button" onClick={() => togglePreference(key)}>
                  <span>{label}</span>
                  <span className={`toggle-switch ${notificationPrefs[key] ? 'on' : ''}`} />
                </button>
              ))}
            </div>
          </article>
        )}

        {activeTab === 'privacy' && (
          <article className="settings-card">
            <h2>Privacy & Access History</h2>
            <p>View who has accessed your vehicle records</p>

            <div className="access-history-list">
              {accessHistory.map((item) => (
                <div className="access-history-row" key={item.title}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <span className={`status-pill ${item.status === 'Denied' ? 'danger' : ''}`}>{item.status}</span>
                </div>
              ))}
            </div>
          </article>
        )}

        {activeTab === 'sessions' && (
          <article className="settings-card">
            <h2>Active Shared Sessions</h2>
            <p>Manage currently active mechanic access sessions</p>

            {activeSession ? (
              <div className="active-session-card">
                <span className="session-clock">◷</span>
                <div>
                  <strong>Juan Santos - Superior Auto Repairs</strong>
                  <small>Toyota Vios 2021 - 45 minutes remaining</small>
                </div>
                <button type="button" onClick={() => setActiveSession(false)}>
                  Revoke
                </button>
              </div>
            ) : (
              <div className="empty-panel compact">No active shared sessions.</div>
            )}
            <p className="settings-footnote">All sessions automatically expire after the approved time limit.</p>
          </article>
        )}
      </section>
    </main>
  );
}
