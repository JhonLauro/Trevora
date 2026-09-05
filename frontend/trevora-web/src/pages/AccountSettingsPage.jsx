import React, { useMemo, useRef, useState } from 'react';
import { LANGUAGES, useLanguage } from '../i18n/index.jsx';
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

/* Keys, resolved at render: module-level data is built before a language is
   bound, so a t() call here runs with nothing to look up. */
const accessNotifications = [
  ['mechanicRequest', 'set.mechanicAsks', 'set.youDecide'],
  ['temporaryExpired', 'set.accessExpired', 'set.noLongerSee'],
];

const passwordFields = [
  ['currentPassword', 'set.currentPassword'],
  ['newPassword', 'set.newPassword'],
  ['confirmPassword', 'set.repeatPassword'],
];

/**
 * Moves focus to the first field a save rejected, so the reason is on screen.
 *
 * <p>This page is long enough that a rejected save could set an error two
 * screens above the button that was just pressed, leaving nothing to see —
 * login and register have always focused the first bad field and this had not
 * caught up.
 *
 * <p>The field is found in DOM order rather than by walking the errors object,
 * so it lands on the topmost error whatever order the caller happened to list
 * them in, and reordering the form keeps it right without anyone remembering
 * to reorder a list here as well.
 */
function focusFirstInvalid(formElement, errors) {
  const invalid = Object.keys(errors).filter((name) => errors[name]);
  if (!formElement || invalid.length === 0) return;
  const field = [...formElement.querySelectorAll('[name]')]
    .find((element) => invalid.includes(element.name));
  // focus() brings it into view on its own; no separate scroll needed.
  field?.focus();
}

function splitName(fullName) {
  const parts = String(fullName || t('set.vehicleOwner')).trim().split(/\s+/);
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
  const word = count === 1 ? t('set.oneChange') : count === 2 ? t('set.twoChanges') : `${count} changes`;
  return `${word} not saved yet.`;
}

export default function AccountSettingsPage() {
  const { language, setLanguage, t } = useLanguage();
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
    if (name === 'firstName' && !trimmed) return t('set.needFirst');
    if (name === 'lastName' && !trimmed) return t('set.needLast');
    if (name === 'email') {
      if (!trimmed) return t('set.needEmail');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return t('set.badEmail');
    }
    return null;
  }

  function updatePasswordField(event) {
    const { name, value } = event.target;
    setPasswordForm((current) => ({ ...current, [name]: value }));
    setPasswordErrors((current) => (current[name] ? { ...current, [name]: null } : current));
    setStatus('password', null);
  }

  function validatePassword(name, value, source) {
    const state = source || passwordForm;
    if (name === 'currentPassword' && !value) return t('set.needCurrent');
    if (name === 'newPassword') {
      if (!value) return t('set.needNew');
      if (value.length < 8) return t('auth.min8');
    }
    if (name === 'confirmPassword') {
      if (!value) return t('set.needRepeat');
      if (value !== state.newPassword) return t('set.noMatch');
    }
    return null;
  }

  async function saveProfile(event) {
    event.preventDefault();
    // Held before the first await: the handler is async, and the event's
    // currentTarget is not guaranteed to still point at the form afterwards.
    const formElement = event.currentTarget;
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
      focusFirstInvalid(formElement, errors);
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
          ? t('set.savedEmail')
          : t('set.savedMoment'),
      });
    } catch (error) {
      setStatus('details', { tone: 'bad', text: error.message || 'Could not save your details.' });
    } finally {
      setSavingSection(null);
    }
  }

  async function updatePassword(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const errors = {
      currentPassword: validatePassword('currentPassword', passwordForm.currentPassword),
      newPassword: validatePassword('newPassword', passwordForm.newPassword),
      confirmPassword: validatePassword('confirmPassword', passwordForm.confirmPassword),
    };
    setPasswordErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      setStatus('password', null);
      focusFirstInvalid(formElement, errors);
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
        setPasswordErrors({ currentPassword: t('set.wrongCurrent') });
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
    setStatus('notifications', { tone: 'ok', text: t('set.savedMoment') });
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
        <h1>{t('set.title')}</h1>
        <p>{t('set.sub')}</p>
      </header>

      <section className="set-section">
        <div className="set-rail">
          <h2>{t('settings.details.heading')}</h2>
          <p>{t('set.detailsHelp')}</p>
        </div>

        <form className="set-body" onSubmit={saveProfile}>
          <div className="set-avatar-row">
            <span className="set-avatar">
              {form.avatar ? <img alt="" src={form.avatar} /> : initials(form.firstName, form.lastName)}
            </span>
            <div className="set-avatar-meta">
              <span className="set-avatar-name">{displayName || t('set.vehicleOwner')}</span>
              <button
                className="set-textbutton"
                type="button"
                disabled={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingPhoto ? 'Uploading...' : t('set.changePhoto')}
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
              {t('auth.firstName')}
              <input name="firstName" value={form.firstName} onChange={updateField} />
              {detailErrors.firstName && <span className="set-error">{detailErrors.firstName}</span>}
            </label>
            <label className={`set-field ${detailErrors.lastName ? 'invalid' : ''}`}>
              {t('auth.lastName')}
              <input name="lastName" value={form.lastName} onChange={updateField} />
              {detailErrors.lastName && <span className="set-error">{detailErrors.lastName}</span>}
            </label>
            <label className={`set-field ${detailErrors.email ? 'invalid' : ''}`}>
              {t('auth.email')}
              <input name="email" type="email" value={form.email} onChange={updateField} />
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
              {savingSection === 'details' ? 'Saving...' : t('set.saveDetails')}
            </button>
            {renderStatus('details')}
          </div>
        </form>
      </section>

      <div className="set-rule" />

      <section className="set-section">
        <div className="set-rail">
          <h2>{t('settings.password.heading')}</h2>
          <p>{t('set.passwordHelp')}</p>
        </div>

        <form className="set-body narrow" onSubmit={updatePassword}>
          {passwordFields.map(([key, labelKey]) => (
            <label className={`set-field ${passwordErrors[key] ? 'invalid' : ''}`} key={key}>
              {t(labelKey)}
              <span className="set-reveal-wrap">
                <input
                  name={key}
                  type={showPasswords[key] ? 'text' : 'password'}
                  value={passwordForm[key]}
                  onChange={updatePasswordField}
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
              {savingSection === 'password' ? 'Changing...' : t('set.changePassword')}
            </button>
            {renderStatus('password')}
          </div>
        </form>
      </section>

      <div className="set-rule" />

      {/* Above Notifications, because both are "how Trevora behaves for me on
          this device" and this one frames every word below it. */}
      <section className="set-section">
        <div className="set-rail">
          <h2>{t('settings.language.heading')}</h2>
          <p>{t('settings.language.rail')}</p>
        </div>

        <div className="set-body">
          <p className="set-note">{t('settings.language.note')}</p>

          <div className="set-card lang-choices" role="radiogroup" aria-label={t('settings.language.heading')}>
            {LANGUAGES.map((option) => (
              <button
                aria-checked={language === option.code}
                className="set-row"
                key={option.code}
                role="radio"
                type="button"
                onClick={() => setLanguage(option.code)}
              >
                <span className="set-row-text">
                  {/* The name of the language in that language: somebody
                      looking for Bisaya is looking for the word "Bisaya". */}
                  <strong>{option.endonym}</strong>
                  {option.endonym !== option.label && <span>{option.label}</span>}
                </span>
                <span className={`lang-tick${language === option.code ? ' is-on' : ''}`} aria-hidden="true" />
              </button>
            ))}
          </div>

          <p className="set-note">{t('settings.language.saved')}</p>
        </div>
      </section>

      <section className="set-section">
        <div className="set-rail">
          <h2>{t('settings.notifications.heading')}</h2>
          <p>{t('settings.notifications.rail')}</p>
        </div>

        <div className="set-body">
          <p className="set-note">
            These choices are saved in this browser only, and control what appears in Trevora — the notifications list
            and the count on the sidebar. Trevora does not send email or push notifications.
          </p>

          <div className="set-group">
            <span className="set-group-label">{t('settings.notifications.yourRecords')}</span>
            <div className="set-card">
              {recordNotifications.map(([key, titleKey, descriptionKey]) => (
                <button
                  aria-checked={notificationPrefs[key] ? 'true' : 'false'}
                  className="set-row"
                  key={key}
                  role="switch"
                  type="button"
                  onClick={() => togglePreference(key)}
                >
                  <span className="set-row-text">
                    <span className="set-row-title">{t(titleKey)}</span>
                    <span className="set-row-sub">{t(descriptionKey)}</span>
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
              <span className="set-group-label">{t('set.mechanicAccess')}</span>
              <span className="set-group-note">{t('set.whoCanSee')}</span>
            </div>
            <div className="set-card">
              {accessNotifications.map(([key, titleKey, descriptionKey]) => (
                <button
                  aria-checked={notificationPrefs[key] ? 'true' : 'false'}
                  className="set-row"
                  key={key}
                  role="switch"
                  type="button"
                  onClick={() => togglePreference(key)}
                >
                  <span className="set-row-text">
                    <span className="set-row-title">{t(titleKey)}</span>
                    <span className="set-row-sub">{t(descriptionKey)}</span>
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
              {t('set.saveNotifications')}
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
            {signOutConfirming ? t('set.signOutAsk') : t('set.signOutOf')}
          </span>
          <span className="set-signout-sub">{t('set.thisDevice')}</span>
        </div>
        {signOutConfirming ? (
          <div className="set-confirm">
            <button className="set-button danger" type="button" disabled={signingOut} onClick={handleSignOut}>
              {signingOut ? 'Signing out…' : t('set.signOut')}
            </button>
            <button className="set-button quiet" type="button" onClick={() => setSignOutConfirming(false)}>
              {t('set.staySignedIn')}
            </button>
          </div>
        ) : (
          <button className="set-button danger" type="button" onClick={() => setSignOutConfirming(true)}>
            {t('set.signOut')}
          </button>
        )}
      </section>

      <div className="set-rule" />

      <section className="set-danger">
        <div className="set-signout-text">
          <span className="set-signout-title">{t('set.deleteThis')}</span>
          <span className="set-signout-sub">
            Permanently removes your vehicles, service records, receipt images, share
            links and any mechanic access you have granted. This cannot be undone.
          </span>
        </div>
        <button className="set-button danger" type="button" onClick={openDeleteDialog}>
          {t('set.deleteAccount')}
        </button>
      </section>

      <ConfirmDialog
        open={deleteOpen}
        busy={deleting}
        error={deleteError}
        title={t('set.deleteAsk')}
        confirmLabel={t('set.deletePermanently')}
        busyLabel="Deleting…"
        confirmDisabled={!deleteArmed}
        onCancel={() => { if (!deleting) { setDeleteOpen(false); setDeleteTyped(''); setDeleteError(''); } }}
        onConfirm={handleDeleteAccount}
        body={(
          <>
            <p>
              {deleteCounts
                ? `This removes ${deleteCounts.vehicles} vehicle${deleteCounts.vehicles === 1 ? '' : 's'} and ${deleteCounts.records} service record${deleteCounts.records === 1 ? '' : 's'}, along with their receipt images.`
                : t('set.deleteWarn3')}
            </p>
            <p>
              {t('set.deleteWarn2')}
              {t('set.deleteWarn1')}
            </p>
            <p>
              Your sign-in is deleted too, so signing in again creates a new, empty
              account rather than restoring this one. Nothing here can be recovered.
            </p>
            <label className="set-danger-field">
              <span>{t('set.typeDelete')}</span>
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
