import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Bell, Car, ChevronsLeft, ChevronsRight, FileText, Menu, Settings, Share2, X } from 'lucide-react';
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
import AccessRequestToasts from './AccessRequestToasts.jsx';
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
  { to: '/', label: 'Garage', end: true, icon: Car },
  { to: '/records', label: 'Records', icon: FileText },
  { to: '/access/requests', label: 'Shared access', icon: Share2 },
  { to: '/notifications', label: 'Notifications', badge: 'notifications', icon: Bell },
  { to: '/account-settings', label: 'Settings', icon: Settings },
];

/* The rail's collapsed state is a per-browser preference, not account data:
   it is about the screen you are sitting at, so it belongs in localStorage
   rather than on the user. Read defensively — private mode and blocked site
   data both throw on access rather than returning null. */
const RAIL_STORAGE_KEY = 'trevora.railCollapsed';

function readRailCollapsed() {
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeRailCollapsed(collapsed) {
  try {
    window.localStorage.setItem(RAIL_STORAGE_KEY, String(collapsed));
  } catch {
    // A preference that cannot be remembered is not worth failing a render for.
  }
}

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
 * Nav rows, shared by the desktop rail and the mobile sheet.
 *
 * Active state is one device, and it has changed twice for the same reason
 * each time: two things saying it at once. It was a filled row *and* a left
 * rule; then the fill was dropped and it became weight plus the rule. In the
 * green brand it is a filled pill — the shape the rest of the product uses
 * for every selected or actionable thing — and the rule is gone.
 */
function ShellNav({ pendingCount, onNavigate }) {
  return (
    <nav className="ink-nav" aria-label="Primary">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={navClass}
          title={item.label}
          onClick={onNavigate}
        >
          {/* Decorative: the label beside it is the accessible name, so an
              icon with its own would have every row announced twice. */}
          <item.icon className="ink-nav__icon" size={18} strokeWidth={1.9} aria-hidden="true" />
          {/* Collapsed, this is clipped rather than removed — it is the row's
              accessible name, and an icon-only link with no name is a link
              screen readers announce as nothing. */}
          <span className="ink-nav__label">{item.label}</span>
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
  /* The sheet has to outlive the decision to close it: an element removed from
     the tree cannot animate on its way out. `menuClosing` keeps it mounted for
     the length of the exit, and every close path goes through `closeMenu`
     rather than setting `menuOpen` directly. */
  const [menuClosing, setMenuClosing] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(readRailCollapsed);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const sheetRef = useRef(null);
  const menuButtonRef = useRef(null);
  const closeTimerRef = useRef(null);

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

  /* Must match the exit animation in brand-app.css. A timer rather than
     `animationend`: under `prefers-reduced-motion` that event may never
     arrive, and a sheet that never unmounts is a worse bug than a stiff
     animation. */
  const SHEET_EXIT_MS = 240;

  const closeMenu = useCallback(() => {
    setMenuClosing((closing) => {
      if (closing) return closing;
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => {
        setMenuOpen(false);
        setMenuClosing(false);
      }, SHEET_EXIT_MS);
      return true;
    });
  }, []);

  const openMenu = useCallback(() => {
    window.clearTimeout(closeTimerRef.current);
    setMenuClosing(false);
    setMenuOpen(true);
  }, []);

  // A pending close must not fire against a shell that has gone.
  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  // Route change closes the sheet; without this, tapping a nav item on mobile
  // navigates behind a still-open overlay.
  useEffect(() => {
    closeMenu();
  }, [closeMenu, location.pathname]);

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
        closeMenu();
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

  function toggleRail() {
    // The write is deliberately outside the updater. React's StrictMode calls
    // updater functions twice in development to surface impure ones, so a
    // side effect in there runs twice per click.
    const next = !railCollapsed;
    setRailCollapsed(next);
    writeRailCollapsed(next);
  }

  return (
    <div className="ink-app" data-rail={railCollapsed ? 'collapsed' : 'expanded'}>
      <aside className="ink-sidebar">
        <div className="ink-sidebar__brand">
          <Link to="/" aria-label="Trevora, go to Garage">
            <InkLockup />
          </Link>
          {/* A toggle, not a disclosure: the nav is still there and still
              operable when collapsed, only narrower. `aria-expanded` would
              claim it had been hidden. */}
          <button
            className="ink-rail-toggle"
            type="button"
            aria-pressed={railCollapsed}
            aria-label={railCollapsed ? 'Widen the sidebar' : 'Narrow the sidebar'}
            title={railCollapsed ? 'Widen the sidebar' : 'Narrow the sidebar'}
            onClick={toggleRail}
          >
            {railCollapsed
              ? <ChevronsRight size={18} aria-hidden="true" />
              : <ChevronsLeft size={18} aria-hidden="true" />}
          </button>
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
            onClick={openMenu}
          >
            <Menu size={18} aria-hidden="true" />
            <span>Menu</span>
          </button>
        </div>
      </header>

      {menuOpen && (
        <div
          className={`ink-sheet__backdrop${menuClosing ? ' is-closing' : ''}`}
          onClick={closeMenu}
        >
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
                onClick={() => { closeMenu(); menuButtonRef.current?.focus(); }}
              >
                <X size={18} aria-hidden="true" />
                <span>Close</span>
              </button>
            </div>
            <ShellNav pendingCount={pendingCount} onNavigate={closeMenu} />
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

      {/* Lives in the shell so it reaches every signed-in screen. Gated on the
          same two conditions as the sidebar count, so an owner who has turned
          mechanic-request notifications off does not get popped at anyway. */}
      <AccessRequestToasts
        enabled={canUseOwnerWorkflows}
        mechanicRequests={mechanicRequestsEnabled}
        preferences={notificationPreferences}
      />

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

