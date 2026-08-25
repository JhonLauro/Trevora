import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Shield,
  User,
} from 'lucide-react';
import { syncCurrentUserProfile } from '../api/auth.js';
import { clearLoggedInUser, getActiveCurrentUser, getUserDisplayName, setLoggedInUser } from '../api/currentUser';
import { getMechanicAccessRequests, getOwnerMechanicAccessSessions, revokeOwnerMechanicAccessSession } from '../api/qrAccess.js';
import {
  defaultNotificationPreferences,
  getNotificationPreferences,
  saveNotificationPreferences,
} from '../api/notificationPreferences.js';
import { describeAvatarLimit, uploadProfilePhoto } from '../api/profilePhoto.js';
import { supabase } from '../api/supabaseClient.js';

const PROFILE_EXTRAS_KEY = 'trevora.profileExtras';

const settingsNav = [
  { id: 'profile', icon: User, label: 'Profile Information' },
  { id: 'security', icon: KeyRound, label: 'Password & Security' },
  { id: 'notifications', icon: Bell, label: 'Notification Preferences' },
  { id: 'privacy', icon: Shield, label: 'Privacy & Access History' },
  { id: 'sessions', icon: Clock3, label: 'Active Shared Sessions' },
];

// One row per category in api/notificationPreferences.js, and no more: a row
// without a category is a switch that controls nothing, which is what four of
// the seven here turned out to be.
const notificationRows = [
  ['draftReview', 'Service draft needs review'],
  ['mechanicRequest', 'Mechanic requested access'],
  ['temporaryExpired', 'Temporary access expired'],
];

function splitName(fullName) {
  const parts = String(fullName || 'Vehicle Owner').trim().split(/\s+/);
  return {
    firstName: parts[0] || 'Vehicle',
    lastName: parts.slice(1).join(' ') || 'Owner',
  };
}

function initials(firstName, lastName) {
  return `${firstName?.[0] || 'V'}${lastName?.[0] || 'O'}`.toUpperCase();
}

function loadJson(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(window.localStorage.getItem(key) || '{}') };
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function minutesRemaining(value) {
  const diff = Math.max(0, new Date(value).getTime() - Date.now());
  if (diff === 0) return 'Expired';
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} remaining`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m remaining`;
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('denied') || normalized.includes('revoked')) return 'danger';
  if (normalized.includes('approved') || normalized.includes('active')) return 'success';
  return '';
}

export default function AccountSettingsPage() {
  const fileInputRef = useRef(null);
  const currentUser = getActiveCurrentUser();
  const baseName = currentUser?.firstName || currentUser?.lastName
    ? { firstName: currentUser?.firstName || '', lastName: currentUser?.lastName || '' }
    : splitName(getUserDisplayName(currentUser));
  const profileExtras = useMemo(() => loadJson(PROFILE_EXTRAS_KEY, {}), []);

  const [activeTab, setActiveTab] = useState('profile');
  const [form, setForm] = useState({
    firstName: baseName.firstName,
    lastName: baseName.lastName,
    email: currentUser?.email || '',
    phone: profileExtras.phone || currentUser?.phone || '',
    // Account first, browser second: `profileExtras.avatar` is only ever a
    // leftover base64 photo from the old localStorage scheme, and preferring
    // it would hide the real one from anyone who had set a photo before.
    avatar: currentUser?.avatar || profileExtras.avatar || '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [notificationPrefs, setNotificationPrefs] = useState(getNotificationPreferences);
  const [accessRequests, setAccessRequests] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (activeTab !== 'privacy' && activeTab !== 'sessions') return undefined;
    let mounted = true;

    async function loadAccessData() {
      setMessage(null);
      try {
        const [requests, sessions] = await Promise.all([
          getMechanicAccessRequests(),
          getOwnerMechanicAccessSessions(),
        ]);
        if (!mounted) return;
        setAccessRequests(requests);
        setActiveSessions(sessions.filter((session) => session.status === 'APPROVED'));
      } catch (error) {
        if (mounted) setMessage({ type: 'error', text: error.message || 'Could not load access data.' });
      }
    }

    loadAccessData();
    return () => {
      mounted = false;
    };
  }, [activeTab]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setMessage(null);
  }

  function updatePasswordField(event) {
    const { name, value } = event.target;
    setPasswordForm((current) => ({ ...current, [name]: value }));
    setMessage(null);
  }

  async function saveProfile(event) {
    event.preventDefault();
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();

    if (!firstName || !lastName || !email) {
      setMessage({ type: 'error', text: 'First name, last name, and email are required.' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      let syncedUser = currentUser;
      if (supabase) {
        const metadata = {
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`.trim(),
          name: `${firstName} ${lastName}`.trim(),
          phone,
          role: currentUser?.role || 'VEHICLE_OWNER',
        };
        const updatePayload = email !== currentUser?.email
          ? { email, data: metadata }
          : { data: metadata };
        const { error } = await supabase.auth.updateUser(updatePayload);
        if (error) throw new Error(error.message);
      }

      try {
        syncedUser = await syncCurrentUserProfile({
          firstName,
          lastName,
          role: currentUser?.role || 'VEHICLE_OWNER',
        });
      } catch {
        syncedUser = currentUser;
      }

      // The photo is not in here any more: it lives in Supabase Auth metadata,
      // which is what lets it follow the account to another browser.
      const extras = { phone };
      saveJson(PROFILE_EXTRAS_KEY, extras);
      setLoggedInUser({
        ...currentUser,
        ...syncedUser,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        email,
        phone,
        avatar: form.avatar,
        role: currentUser?.role || syncedUser?.role || 'VEHICLE_OWNER',
        accessToken: currentUser?.accessToken,
      });
      setMessage({
        type: 'success',
        text: email !== currentUser?.email
          ? 'Profile saved. Check your inbox if Supabase requires email confirmation.'
          : 'Profile changes saved.',
      });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not save profile changes.' });
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword(event) {
    event.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setMessage({ type: 'error', text: 'Complete all password fields.' });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: 'error', text: 'New password and confirmation must match.' });
      return;
    }
    if (!supabase) {
      setMessage({ type: 'error', text: 'Supabase Auth is not configured, so password changes are unavailable here.' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const email = currentUser?.email || form.email;
      const signInResult = await supabase.auth.signInWithPassword({
        email,
        password: passwordForm.currentPassword,
      });
      if (signInResult.error) throw new Error('Current password is incorrect.');

      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      if (error) throw new Error(error.message);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage({ type: 'success', text: 'Password updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not update password.' });
    } finally {
      setLoading(false);
    }
  }

  function togglePreference(key) {
    setNotificationPrefs((current) => {
      const next = { ...current, [key]: !current[key] };
      // Saving through the shared module is what makes the switch mean
      // something: it notifies the notification list and the sidebar badge,
      // which now read these same values.
      saveNotificationPreferences(next);
      // Naming the row matters here: seven switches sit in one list and the
      // banner appears at the bottom of all of them, so "Notification turned
      // on." left you to remember which one you had just pressed.
      const label = notificationRows.find(([rowKey]) => rowKey === key)?.[1] ?? 'Notification';
      setMessage({
        type: 'success',
        text: `${label}: ${next[key] ? 'on' : 'off'}.`,
      });
      return next;
    });
  }

  /**
   * The photo saves on its own rather than waiting for Save Changes. It is not
   * a form field -- there is nothing to review or correct before it applies,
   * and pairing an immediate preview with a change that silently needed a
   * second click was the surest way to lose it.
   */
  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0];
    // Clearing the input lets the same file be picked again after a failure.
    event.target.value = '';
    if (!file) return;

    setUploadingPhoto(true);
    setMessage(null);
    try {
      const avatar = await uploadProfilePhoto(file);
      setForm((current) => ({ ...current, avatar }));
      setMessage({ type: 'success', text: 'Profile photo updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not update your profile photo.' });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function revokeSession(sessionId) {
    setLoading(true);
    setMessage(null);
    try {
      await revokeOwnerMechanicAccessSession(sessionId);
      setActiveSessions((current) => current.filter((session) => session.mechanicAccessSessionId !== sessionId));
      setMessage({ type: 'success', text: 'Shared session revoked.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not revoke this session.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      if (supabase) await supabase.auth.signOut();
    } finally {
      clearLoggedInUser();
      window.location.assign('/login');
    }
  }

  const displayName = `${form.firstName} ${form.lastName}`.trim();

  return (
    <main className="page-shell account-settings-page">
      <section className="page-header">
        <h1>Account Settings</h1>
        <p>Manage your account preferences and security</p>
      </section>

      <section className="account-settings-layout">
        <aside className="settings-menu">
          {settingsNav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={activeTab === item.id ? 'active' : ''}
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMessage(null);
                }}
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            );
          })}
          <button className="danger" type="button" onClick={handleSignOut}>
            <LogOut size={18} aria-hidden="true" />
            Sign Out
          </button>
        </aside>

        {activeTab === 'profile' && (
          <article className="settings-card">
            <h2>Profile Information</h2>
            <p>Update your personal details</p>

            <div className="settings-profile-heading">
              <span className={`settings-avatar ${form.avatar ? 'has-photo' : ''}`}>
                {form.avatar ? <img alt="" src={form.avatar} /> : initials(form.firstName, form.lastName)}
              </span>
              <div>
                <strong>{displayName}</strong>
                <small>Vehicle Owner</small>
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingPhoto ? 'Uploading…' : 'Change photo'}
                </button>
                <small className="settings-photo-hint">JPG or PNG, up to {describeAvatarLimit()}.</small>
                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                />
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
                <input name="phone" value={form.phone} onChange={updateField} placeholder="+63 917 123 4567" />
              </label>
              {message && <div className={`${message.type}-banner`}>{message.text}</div>}
              <div className="settings-actions">
                <button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </article>
        )}

        {activeTab === 'security' && (
          <article className="settings-card">
            <h2>Password & Security</h2>
            <p>Change your password to keep your account secure</p>

            <form className="settings-form password-settings-form" onSubmit={updatePassword}>
              {[
                ['currentPassword', 'Current Password'],
                ['newPassword', 'New Password'],
                ['confirmPassword', 'Confirm New Password'],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <span className="password-input-wrap">
                    <input
                      name={key}
                      type={showPasswords[key] ? 'text' : 'password'}
                      value={passwordForm[key]}
                      onChange={updatePasswordField}
                    />
                    <button
                      aria-label={showPasswords[key] ? `Hide ${label}` : `Show ${label}`}
                      type="button"
                      onClick={() => setShowPasswords((current) => ({ ...current, [key]: !current[key] }))}
                    >
                      {showPasswords[key] ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </span>
                </label>
              ))}
              {message && <div className={`${message.type}-banner`}>{message.text}</div>}
              <div className="settings-actions">
                <button type="submit" disabled={loading}>{loading ? 'Updating...' : 'Update Password'}</button>
              </div>
            </form>
          </article>
        )}

        {activeTab === 'notifications' && (
          <article className="settings-card">
            <h2>Notification Preferences</h2>
            <p>Choose which notifications you'd like to receive</p>

            <div className="settings-list">
              {notificationRows.map(([key, label]) => (
                <button className="settings-row" key={key} type="button" onClick={() => togglePreference(key)}>
                  <span>{label}</span>
                  <span className={`toggle-switch ${notificationPrefs[key] ? 'on' : ''}`} />
                </button>
              ))}
            </div>
            {message && <div className={`${message.type}-banner settings-inline-message`}>{message.text}</div>}
          </article>
        )}

        {activeTab === 'privacy' && (
          <article className="settings-card">
            <h2>Privacy & Access History</h2>
            <p>View who has requested or received access to your vehicle records</p>

            {message && <div className={`${message.type}-banner`}>{message.text}</div>}
            <div className="access-history-list">
              {accessRequests.length === 0 ? (
                <div className="empty-panel compact">No mechanic access requests yet.</div>
              ) : (
                accessRequests.map((item) => (
                  <div className="access-history-row" key={item.mechanicAccessRequestId}>
                    <div>
                      <strong>{item.mechanicName || 'Unknown mechanic'}{item.shopName ? ` - ${item.shopName}` : ''}</strong>
                      <small>
                        {item.vehicleLabel || 'Selected vehicle'} · Requested {formatDateTime(item.requestedAt)}
                      </small>
                    </div>
                    <span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span>
                  </div>
                ))
              )}
            </div>
          </article>
        )}

        {activeTab === 'sessions' && (
          <article className="settings-card">
            <h2>Active Shared Sessions</h2>
            <p>Manage currently active mechanic access sessions</p>

            {message && <div className={`${message.type}-banner`}>{message.text}</div>}
            {activeSessions.length > 0 ? (
              <div className="active-session-list">
                {activeSessions.map((session) => (
                  <div className="active-session-card" key={session.mechanicAccessSessionId}>
                    <span className="session-clock"><Clock3 size={16} aria-hidden="true" /></span>
                    <div>
                      <strong>
                        {session.mechanicName || 'Mechanic'}{session.shopName ? ` - ${session.shopName}` : ''}
                      </strong>
                      <small>{session.vehicleLabel} · {minutesRemaining(session.expiresAt)}</small>
                    </div>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => revokeSession(session.mechanicAccessSessionId)}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
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
