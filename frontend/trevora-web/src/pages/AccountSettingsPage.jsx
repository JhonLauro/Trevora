import React, { useMemo, useRef, useState } from 'react';
import { deleteAccount, syncCurrentUserProfile } from '../api/auth.js';
import ConfirmDialog from '../components/ink/ConfirmDialog';
import { getGarageSummary } from '../api/serviceHistory.js';
import { clearLoggedInUser, getActiveCurrentUser, getUserDisplayName, setLoggedInUser } from '../api/currentUser';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from '../api/notificationPreferences.js';
import { describeAvatarLimit, uploadProfilePhoto } from '../api/profilePhoto.js';
import { supabase } from '../api/supabaseClient.js';

const PROFILE_EXTRAS_KEY = 'trevora.profileExtras';

// One row per category in api/notificationPreferences.js and no more — a row
// without a category is a switch that controls nothing, which is what four of
// the original seven turned out to be. Grouped by what the notification is
// about, because the two access ones are the consequential pair.
const recordNotifications = [
];

const accessNotifications = [
  ['mechanicRequest', 'A mechanic asks for access', 'You decide before anyone can see anything.'],
  ['temporaryExpired', 'Temporary access has expired', 'The mechanic can no longer see the vehicle.'],
];

const passwordFields = [
  ['currentPassword', 'Current password'],
  ['newPassword', 'New password'],
  ['confirmPassword', 'Repeat new password'],
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

function countChanges(a, b) {
  return Object.keys(b).filter((key) => Boolean(a[key]) !== Boolean(b[key])).length;
}

function changeCountLabel(count) {
  if (count === 0) return null;
  const word = count === 1 ? 'One change' : count === 2 ? 'Two changes' : `${count} changes`;
  return `${word} not saved yet.`;
}

export default function AccountSettingsPage() {
  const fileInputRef = useRef(null);
  const currentUser = getActiveCurrentUser();
  const baseName = currentUser?.firstName || currentUser?.lastName
    ? { firstName: currentUser?.firstName || '', lastName: currentUser?.lastName || '' }
    : splitName(getUserDisplayName(currentUser));
  const profileExtras = useMemo(() => loadJson(PROFILE_EXTRAS_KEY, {}), []);
  const storedPrefs = useMemo(() => getNotificationPreferences(), []);

  const [form, setForm] = useState({
    firstName: baseName.firstName,
    lastName: baseName.lastName,
    email: currentUser?.email || '',
    phone: profileExtras.phone || currentUser?.phone || '',
    // Account first, browser second: `profileExtras.avatar` is only ever a
    // leftover base64 photo from the old localStorage scheme.
    avatar: currentUser?.avatar || profileExtras.avatar || '',
  });
  const [detailErrors, setDetailErrors] = useState({});
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [showPasswords, setShowPasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [savedPrefs, setSavedPrefs] = useState(storedPrefs);
  const [notificationPrefs, setNotificationPrefs] = useState(storedPrefs);
  // One status line per section, shown beside that section's own submit
  // button. The old page shared a single banner across five sections and
  // wiped it on every keystroke.
  const [sectionStatus, setSectionStatus] = useState({ details: null, password: null, notifications: null });
  const [savingSection, setSavingSection] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [signOutConfirming, setSignOutConfirming] = useState(false);

  /* The house dialog rather than an inline panel: this is the most
     destructive action in the app, and it should interrupt rather than expand
     quietly under a button you already clicked.

     Typing the word is the one thing added on top. ConfirmDialog already
     defaults focus to Cancel, which is right for deleting one vehicle; for an
     action that ends the whole account, a single travelled click is still too
     cheap. */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteCounts, setDeleteCounts] = useState(null);
  const deleteArmed = deleteTyped.trim().toUpperCase() === 'DELETE';

  /* "This also removes 6 service records" is the sentence that changes minds;
     "this cannot be undone" is wallpaper. The numbers are fetched when the
     dialog opens rather than on page load, so a settings visit does not pay
     for a request most visits never need. */
  function openDeleteDialog() {
    setDeleteOpen(true);
    setDeleteTyped('');
    setDeleteError('');
    setDeleteCounts(null);
    getGarageSummary()
      .then((summary) => {
        const vehicles = summary?.vehicles?.length ?? 0;
        const records = (summary?.records ?? [])
          .reduce((total, entry) => total + (entry.records?.length ?? 0), 0);
        setDeleteCounts({ vehicles, records });
      })
      // A failed count must not block the deletion; the dialog falls back to
      // naming what goes without counting it.
      .catch(() => setDeleteCounts(null));
  }

  async function handleDeleteAccount() {
    if (!deleteArmed || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount();
      // Full reload, not a route change: every cached list and context in
      // memory refers to an account that no longer exists.
      window.location.assign('/login');
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  }

  // Kept from the other branch: handleSignOut sets this, and it is what
  // stops a second click while the sign-out request is in flight.
  const [signingOut, setSigningOut] = useState(false);

  const displayName = `${form.firstName} ${form.lastName}`.trim();
  const unsavedPrefCount = countChanges(savedPrefs, notificationPrefs);

  function setStatus(section, value) {
    setSectionStatus((current) => ({ ...current, [section]: value }));
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setDetailErrors((current) => (current[name] ? { ...current, [name]: null } : current));
    setStatus('details', null);
  }

  function validateDetail(name, value) {
    const trimmed = String(value ?? '').trim();
    if (name === 'firstName' && !trimmed) return 'Enter your first name.';
    if (name === 'lastName' && !trimmed) return 'Enter your last name.';
    if (name === 'email') {
      if (!trimmed) return 'Enter your email address.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'That does not look like an email address.';
    }
    return null;
  }

  function blurDetail(event) {
    const { name, value } = event.target;
    const error = validateDetail(name, value);
    setDetailErrors((current) => ({ ...current, [name]: error }));
  }

  function updatePasswordField(event) {
    const { name, value } = event.target;
    setPasswordForm((current) => ({ ...current, [name]: value }));
    setPasswordErrors((current) => (current[name] ? { ...current, [name]: null } : current));
    setStatus('password', null);
  }

  function validatePassword(name, value, source) {
    const state = source || passwordForm;
    if (name === 'currentPassword' && !value) return 'Enter your current password.';
    if (name === 'newPassword') {
      if (!value) return 'Enter a new password.';
      if (value.length < 8) return 'Use at least 8 characters.';
    }
    if (name === 'confirmPassword') {
      if (!value) return 'Repeat the new password.';
      if (value !== state.newPassword) return 'These two do not match yet.';
    }
    return null;
  }

  function blurPassword(event) {
    const { name, value } = event.target;
    setPasswordErrors((current) => ({ ...current, [name]: validatePassword(name, value) }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();

    const errors = {
      firstName: validateDetail('firstName', firstName),
      lastName: validateDetail('lastName', lastName),
      email: validateDetail('email', email),
    };
    setDetailErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      setStatus('details', null);
      return;
    }

    setSavingSection('details');
    setStatus('details', null);
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
      saveJson(PROFILE_EXTRAS_KEY, { phone });
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
      setStatus('details', {
        tone: 'ok',
        text: email !== currentUser?.email
          ? 'Saved. Check your inbox to confirm the new email address.'
          : 'Saved a moment ago.',
      });
    } catch (error) {
      setStatus('details', { tone: 'bad', text: error.message || 'Could not save your details.' });
    } finally {
      setSavingSection(null);
    }
  }

  async function updatePassword(event) {
    event.preventDefault();
    const errors = {
      currentPassword: validatePassword('currentPassword', passwordForm.currentPassword),
      newPassword: validatePassword('newPassword', passwordForm.newPassword),
      confirmPassword: validatePassword('confirmPassword', passwordForm.confirmPassword),
    };
    setPasswordErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      setStatus('password', null);
      return;
    }
    if (!supabase) {
      setStatus('password', { tone: 'bad', text: 'Supabase Auth is not configured, so password changes are unavailable here.' });
      return;
    }

    setSavingSection('password');
    setStatus('password', null);
    try {
      const email = currentUser?.email || form.email;
      const signInResult = await supabase.auth.signInWithPassword({
        email,
        password: passwordForm.currentPassword,
      });
      if (signInResult.error) {
        setPasswordErrors({ currentPassword: 'That is not your current password.' });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      if (error) throw new Error(error.message);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setStatus('password', { tone: 'ok', text: 'Password changed.' });
    } catch (error) {
      setStatus('password', { tone: 'bad', text: error.message || 'Could not change your password.' });
    } finally {
      setSavingSection(null);
    }
  }

  function togglePreference(key) {
    // Flips optimistically and marks the section dirty. No success banner
    // per toggle — nothing has been saved yet.
    setNotificationPrefs((current) => ({ ...current, [key]: !current[key] }));
    setStatus('notifications', null);
  }

  function saveNotifications() {
    // Through the shared module, not straight to localStorage: this is what
    // notifies the sidebar badge and an open Notifications page.
    setSavedPrefs(saveNotificationPreferences(notificationPrefs));
    setStatus('notifications', { tone: 'ok', text: 'Saved a moment ago.' });
  }

  /**
   * The photo saves on its own rather than waiting for Save details. It is not
   * a form field — there is nothing to review before it applies, and pairing an
   * immediate preview with a change that silently needed a second click was the
   * surest way to lose it.
   */
  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0];
    // Clearing the input lets the same file be picked again after a failure.
    event.target.value = '';
    if (!file) return;

    setUploadingPhoto(true);
    setStatus('details', null);
    try {
      const avatar = await uploadProfilePhoto(file);
      setForm((current) => ({ ...current, avatar }));
      setStatus('details', { tone: 'ok', text: 'Photo updated.' });
    } catch (error) {
      setStatus('details', { tone: 'bad', text: error.message || 'Could not update your photo.' });
    } finally {
      setUploadingPhoto(false);
    }
  }

  /* Confirmed before it runs. Signing out is recoverable, so this is not a
     destructive-action dialog — it guards an in-progress draft and a round
     trip through Supabase auth against a stray click.

     The Supabase call was missing here and in the shell: clearing Trevora's
     copy of the session left Supabase's own intact, and http.js refreshes
     tokens from that, so an apparent sign-out was still recoverable. */
  async function handleSignOut() {
    setSigningOut(true);
    try {
      if (supabase) await supabase.auth.signOut();
    } catch {
      // A failed network call must not strand someone signed in.
    } finally {
      clearLoggedInUser();
      window.location.assign('/login');
    }
  }

  function renderStatus(section) {
    const status = sectionStatus[section];
    if (!status) return null;
    return <span className={`set-status ${status.tone}`}>{status.text}</span>;
  }

  return (
    <main className="ink-settings tv-reveal-group">
      <header className="set-head">
        <h1>Account settings</h1>
        <p>Your notifications, your details, and your password.</p>
      </header>

      <section className="set-section">
        <div className="set-rail">
          <h2>Your details</h2>
          <p>Your name and email are how Trevora identifies you on every record.</p>
        </div>

        <form className="set-body" onSubmit={saveProfile}>
          <div className="set-avatar-row">
            <span className="set-avatar">
              {form.avatar ? <img alt="" src={form.avatar} /> : initials(form.firstName, form.lastName)}
            </span>
            <div className="set-avatar-meta">
              <span className="set-avatar-name">{displayName || 'Vehicle Owner'}</span>
              <button
                className="set-textbutton"
                type="button"
                disabled={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingPhoto ? 'Uploading...' : 'Change photo'}
              </button>
              <span className="set-hint faint">{describeAvatarLimit()}</span>
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
              />
            </div>
          </div>

          <p className="set-note">
            Your photo follows your account and saves as soon as you choose it. Your phone number is saved in this
            browser only — sign in somewhere else and it will not be there.
          </p>

          <div className="set-grid">
            <label className={`set-field ${detailErrors.firstName ? 'invalid' : ''}`}>
              First name
              <input name="firstName" value={form.firstName} onChange={updateField} onBlur={blurDetail} />
              {detailErrors.firstName && <span className="set-error">{detailErrors.firstName}</span>}
            </label>
            <label className={`set-field ${detailErrors.lastName ? 'invalid' : ''}`}>
              Last name
              <input name="lastName" value={form.lastName} onChange={updateField} onBlur={blurDetail} />
              {detailErrors.lastName && <span className="set-error">{detailErrors.lastName}</span>}
            </label>
            <label className={`set-field ${detailErrors.email ? 'invalid' : ''}`}>
              Email
              <input name="email" type="email" value={form.email} onChange={updateField} onBlur={blurDetail} />
              {detailErrors.email && <span className="set-error">{detailErrors.email}</span>}
            </label>
            <label className="set-field">
              Phone
              <input name="phone" type="tel" value={form.phone} onChange={updateField} placeholder="0917 555 2841" />
              <span className="set-hint faint">This browser only.</span>
            </label>
          </div>

          <div className="set-submit">
            <button className="set-button" type="submit" disabled={savingSection === 'details'}>
              {savingSection === 'details' ? 'Saving...' : 'Save details'}
            </button>
            {renderStatus('details')}
          </div>
        </form>
      </section>

      <div className="set-rule" />

      <section className="set-section">
        <div className="set-rail">
          <h2>Password</h2>
          <p>We ask for your current password first, to make sure it is you.</p>
        </div>

        <form className="set-body narrow" onSubmit={updatePassword}>
          {passwordFields.map(([key, label]) => (
            <label className={`set-field ${passwordErrors[key] ? 'invalid' : ''}`} key={key}>
              {label}
              <span className="set-reveal-wrap">
                <input
                  name={key}
                  type={showPasswords[key] ? 'text' : 'password'}
                  value={passwordForm[key]}
                  onChange={updatePasswordField}
                  onBlur={blurPassword}
                />
                <button
                  className="set-reveal"
                  type="button"
                  onClick={() => setShowPasswords((current) => ({ ...current, [key]: !current[key] }))}
                >
                  {showPasswords[key] ? 'Hide' : 'Show'}
                </button>
              </span>
              {key === 'newPassword' && !passwordErrors[key] && <span className="set-hint">At least 8 characters.</span>}
              {passwordErrors[key] && <span className="set-error">{passwordErrors[key]}</span>}
            </label>
          ))}

          <div className="set-submit">
            <button className="set-button" type="submit" disabled={savingSection === 'password'}>
              {savingSection === 'password' ? 'Changing...' : 'Change password'}
            </button>
            {renderStatus('password')}
          </div>
        </form>
      </section>

      <div className="set-rule" />

      <section className="set-section">
        <div className="set-rail">
          <h2>Notifications</h2>
          <p>Which of these you want to see while you are using Trevora.</p>
        </div>

        <div className="set-body">
          <p className="set-note">
            These choices are saved in this browser only, and control what appears in Trevora — the notifications list
            and the count on the sidebar. Trevora does not send email or push notifications.
          </p>

          <div className="set-group">
            <span className="set-group-label">Your records</span>
            <div className="set-card">
              {recordNotifications.map(([key, title, description]) => (
                <button
                  aria-checked={notificationPrefs[key] ? 'true' : 'false'}
                  className="set-row"
                  key={key}
                  role="switch"
                  type="button"
                  onClick={() => togglePreference(key)}
                >
                  <span className="set-row-text">
                    <span className="set-row-title">{title}</span>
                    <span className="set-row-sub">{description}</span>
                  </span>
                  <span className="set-row-state">
                    <span className="set-row-word">{notificationPrefs[key] ? 'On' : 'Off'}</span>
                    <span className="set-toggle" />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="set-group">
            <div className="set-group-head">
              <span className="set-group-label">Mechanic access</span>
              <span className="set-group-note">These are about who can see your records.</span>
            </div>
            <div className="set-card">
              {accessNotifications.map(([key, title, description]) => (
                <button
                  aria-checked={notificationPrefs[key] ? 'true' : 'false'}
                  className="set-row"
                  key={key}
                  role="switch"
                  type="button"
                  onClick={() => togglePreference(key)}
                >
                  <span className="set-row-text">
                    <span className="set-row-title">{title}</span>
                    <span className="set-row-sub">{description}</span>
                  </span>
                  <span className="set-row-state">
                    <span className="set-row-word">{notificationPrefs[key] ? 'On' : 'Off'}</span>
                    <span className="set-toggle" />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="set-submit">
            <button className="set-button" type="button" disabled={unsavedPrefCount === 0} onClick={saveNotifications}>
              Save notifications
            </button>
            {unsavedPrefCount > 0
              ? <span className="set-status pending">{changeCountLabel(unsavedPrefCount)}</span>
              : renderStatus('notifications')}
          </div>
        </div>
      </section>

      <div className="set-rule" />

      <section className="set-signout">
        <div className="set-signout-text">
          <span className="set-signout-title">
            {signOutConfirming ? 'Sign out of Trevora?' : 'Sign out of Trevora'}
          </span>
          <span className="set-signout-sub">On this device. Your records stay where they are.</span>
        </div>
        {signOutConfirming ? (
          <div className="set-confirm">
            <button className="set-button danger" type="button" disabled={signingOut} onClick={handleSignOut}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
            <button className="set-button quiet" type="button" onClick={() => setSignOutConfirming(false)}>
              Stay signed in
            </button>
          </div>
        ) : (
          <button className="set-button danger" type="button" onClick={() => setSignOutConfirming(true)}>
            Sign out
          </button>
        )}
      </section>

      <div className="set-rule" />

      <section className="set-danger">
        <div className="set-signout-text">
          <span className="set-signout-title">Delete this account</span>
          <span className="set-signout-sub">
            Permanently removes your vehicles, service records, receipt images, share
            links and any mechanic access you have granted. This cannot be undone.
          </span>
        </div>
        <button className="set-button danger" type="button" onClick={openDeleteDialog}>
          Delete account
        </button>
      </section>

      <ConfirmDialog
        open={deleteOpen}
        busy={deleting}
        error={deleteError}
        title="Delete this account?"
        confirmLabel="Delete permanently"
        busyLabel="Deleting…"
        confirmDisabled={!deleteArmed}
        onCancel={() => { if (!deleting) { setDeleteOpen(false); setDeleteTyped(''); setDeleteError(''); } }}
        onConfirm={handleDeleteAccount}
        body={(
          <>
            <p>
              {deleteCounts
                ? `This removes ${deleteCounts.vehicles} vehicle${deleteCounts.vehicles === 1 ? '' : 's'} and ${deleteCounts.records} service record${deleteCounts.records === 1 ? '' : 's'}, along with their receipt images.`
                : 'This removes every vehicle and service record on this account, along with their receipt images.'}
            </p>
            <p>
              Any share link or mechanic access you have granted stops working immediately.
              A mechanic reading this history right now will lose it.
            </p>
            <p>
              Your sign-in is deleted too, so signing in again creates a new, empty
              account rather than restoring this one. Nothing here can be recovered.
            </p>
            <label className="set-danger-field">
              <span>Type DELETE to confirm</span>
              <input
                className="set-danger-input"
                value={deleteTyped}
                onChange={(event) => setDeleteTyped(event.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                disabled={deleting}
              />
            </label>
          </>
        )}
      />

    </main>
  );
}
