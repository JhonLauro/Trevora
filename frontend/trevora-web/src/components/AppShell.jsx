import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import {
  clearLoggedInUser,
  AUTH_USER_CHANGED_EVENT,
  getActiveCurrentUser,
  getUserDisplayName,
  isLoggedIn,
} from '../api/currentUser.js';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PREFERENCES_CHANGED_EVENT,
  getNotificationPreferences,
  isNotificationEnabled,
} from '../api/notificationPreferences.js';
import { getPendingMechanicAccessRequests } from '../api/qrAccess.js';
import { supabase } from '../api/supabaseClient.js';
import ConfirmDialog from './ink/ConfirmDialog.jsx';
import InkLockup from './InkLockup.jsx';

/**
 * Five destinations. "Add service record" is deliberately absent: it is an
 * action, not a place, and it lives as the primary button in each page header.
 *
 * The old shell also carried an active-vehicle switcher. That is gone — a
 * globally selected vehicle made every number on every page ambiguous until
 * you checked a control somewhere else. Vehicle identity is now in the route.
 */
const NAV_ITEMS = [
  { to: '/', label: 'Garage', end: true },
  { to: '/records', label: 'Records' },
  { to: '/access/requests', label: 'Shared access' },
  { to: '/notifications', label: 'Notifications', badge: 'notifications' },
  { to: '/account-settings', label: 'Settings' },
];

function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function navClass({ isActive }) {
  return isActive ? 'ink-nav__item is-active' : 'ink-nav__item';
}

/**
 * Nav rows, shared by the desktop rail and the mobile sheet. Active state is a
 * single device — weight plus a left rule. The earlier version also filled the
 * row background, which fought the rule for the same job.
 */
function ShellNav({ pendingCount, onNavigate }) {
  return (
    <nav className="ink-nav" aria-label="Primary">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={navClass} onClick={onNavigate}>
          <span>{item.label}</span>
          {item.badge === 'notifications' && pendingCount > 0 && (
            <span className="ink-nav__count">{pendingCount}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell({ children }) {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(getActiveCurrentUser);
  const [authenticated, setAuthenticated] = useState(isLoggedIn);
  const [pendingCount, setPendingCount] = useState(0);
  const [notificationPreferences, setNotificationPreferences] = useState(getNotificationPreferences);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const sheetRef = useRef(null);
  const menuButtonRef = useRef(null);

  const displayName = authenticated ? getUserDisplayName(currentUser) : 'Signed out';
  const avatarUrl = authenticated ? currentUser?.avatar || '' : '';
  // A photo that 404s -- deleted from the bucket, or a stale Google URL --
  // would otherwise show as a broken-image glyph. Falling back to the initials
  // needs state rather than removing the node: the initials are the other
  // branch of the render, not something sitting underneath it. Keyed on the
  // URL so a newly uploaded photo is always given its own chance to load.
  const [brokenAvatarUrl, setBrokenAvatarUrl] = useState('');
  const showAvatar = Boolean(avatarUrl) && avatarUrl !== brokenAvatarUrl;
  const canUseOwnerWorkflows = currentUser?.role === 'VEHICLE_OWNER';

  useEffect(() => {
    function syncCurrentUser() {
      setCurrentUser(getActiveCurrentUser());
      setAuthenticated(isLoggedIn());
    }
    window.addEventListener(AUTH_USER_CHANGED_EVENT, syncCurrentUser);
    return () => window.removeEventListener(AUTH_USER_CHANGED_EVENT, syncCurrentUser);
  }, []);

  useEffect(() => {
    const sync = () => setNotificationPreferences(getNotificationPreferences());
    window.addEventListener(NOTIFICATION_PREFERENCES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(NOTIFICATION_PREFERENCES_CHANGED_EVENT, sync);
  }, []);

  // The badge counts pending mechanic requests, so turning that notification
  // off has to silence the badge too -- a switch that leaves a count burning
  // in the sidebar has not really turned anything off.
  const mechanicRequestsEnabled = isNotificationEnabled(
    NOTIFICATION_CATEGORIES.MECHANIC_REQUEST,
    notificationPreferences,
  );

  useEffect(() => {
    if (!canUseOwnerWorkflows || !mechanicRequestsEnabled) {
      setPendingCount(0);
      return undefined;
    }
    let active = true;
    getPendingMechanicAccessRequests()
      .then((data) => { if (active) setPendingCount(data.length); })
      .catch(() => { if (active) setPendingCount(0); });
    return () => { active = false; };
  }, [canUseOwnerWorkflows, mechanicRequestsEnabled, location.pathname]);

  // Route change closes the sheet; without this, tapping a nav item on mobile
  // navigates behind a still-open overlay.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // The sheet traps focus and closes on Escape. Focus moves back to the button
  // that opened it, so a keyboard user is not returned to the top of the page.
  useEffect(() => {
    if (!menuOpen) return undefined;

    const sheet = sheetRef.current;
    const focusable = () => Array.from(
      sheet?.querySelectorAll('a[href], button:not([disabled])') ?? [],
    );
    focusable()[0]?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  /**
   * Sign out is one click away from five navigation items, and in the
   * sidebar it sits directly under the account row. It is not destructive —
   * nothing is lost that signing back in does not restore — but a misclick
   * discards an in-progress draft and costs a round trip through Supabase
   * auth, so it asks first.
   */
  async function handleSignOut() {
    setSigningOut(true);
    try {
      // Previously omitted here while AccountSettingsPage did it, so signing
      // out from the sidebar cleared Trevora's copy of the session and left
      // Supabase's own intact — and http.js refreshes tokens from that, so
      // the session was still recoverable after an apparent sign-out.
      if (supabase) await supabase.auth.signOut();
    } catch {
      // A failed network call must not strand someone signed in. The local
      // clear below is what actually ends the session for this browser.
    } finally {
      clearLoggedInUser();
      setAuthenticated(false);
      setCurrentUser(null);
      window.location.assign('/login');
    }
  }

  return (
    <div className="ink-app">
      <aside className="ink-sidebar">
        <div className="ink-sidebar__brand">
          <Link to="/" aria-label="Trevora, go to Garage">
            <InkLockup />
          </Link>
        </div>

        <ShellNav pendingCount={pendingCount} />

        <div className="ink-sidebar__spacer" />

        <div className="ink-sidebar__account">
          <div className="ink-account-row">
            <span className="ink-account-row__avatar" aria-hidden="true">
              {showAvatar
                ? <img alt="" src={avatarUrl} onError={() => setBrokenAvatarUrl(avatarUrl)} />
                : initialsFor(displayName)}
            </span>
            <span className="ink-account-row__name">{displayName}</span>
          </div>
          <button className="ink-signout-row" type="button" onClick={() => setConfirmSignOut(true)}>
            Sign out
          </button>
        </div>
      </aside>

      <header className="ink-topbar">
        <Link to="/" aria-label="Trevora, go to Garage">
          <InkLockup />
        </Link>
        <div className="ink-topbar__actions">
          <Link className="ink-topbar__button" to="/notifications">
            <span>Alerts</span>
            {pendingCount > 0 && <span className="ink-topbar__count">{pendingCount}</span>}
          </Link>
          <button
            className="ink-topbar__button"
            type="button"
            ref={menuButtonRef}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={18} aria-hidden="true" />
            <span>Menu</span>
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="ink-sheet__backdrop" onClick={() => setMenuOpen(false)}>
          <div
            className="ink-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            ref={sheetRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ink-sheet__head">
              <InkLockup />
              <button
                className="ink-sheet__close"
                type="button"
                onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }}
              >
                <X size={18} aria-hidden="true" />
                <span>Close</span>
              </button>
            </div>
            <ShellNav pendingCount={pendingCount} onNavigate={() => setMenuOpen(false)} />
            <div className="ink-sheet__account">
              <div className="ink-account-row">
                <span className="ink-account-row__avatar" aria-hidden="true">
              {showAvatar
                ? <img alt="" src={avatarUrl} onError={() => setBrokenAvatarUrl(avatarUrl)} />
                : initialsFor(displayName)}
            </span>
                <span className="ink-account-row__name">{displayName}</span>
              </div>
              <button className="ink-signout-row" type="button" onClick={() => setConfirmSignOut(true)}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmSignOut}
        busy={signingOut}
        title="Sign out of Trevora?"
        confirmLabel="Sign out"
        busyLabel="Signing out…"
        tone="outline"
        onCancel={() => { if (!signingOut) setConfirmSignOut(false); }}
        onConfirm={handleSignOut}
        body={(
          <>
            <p>Anything you are part-way through adding is not saved yet and will be lost.</p>
            <p>Your records stay where they are. You will need to sign in again to reach them.</p>
          </>
        )}
      />

      <div className="ink-app__content">{children}</div>
    </div>
  );
}

