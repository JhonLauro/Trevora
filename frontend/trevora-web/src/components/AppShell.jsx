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
import { getPendingMechanicAccessRequests } from '../api/qrAccess.js';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const sheetRef = useRef(null);
  const menuButtonRef = useRef(null);

  const displayName = authenticated ? getUserDisplayName(currentUser) : 'Signed out';
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
    if (!canUseOwnerWorkflows) {
      setPendingCount(0);
      return undefined;
    }
    let active = true;
    getPendingMechanicAccessRequests()
      .then((data) => { if (active) setPendingCount(data.length); })
      .catch(() => { if (active) setPendingCount(0); });
    return () => { active = false; };
  }, [canUseOwnerWorkflows, location.pathname]);

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

  function handleSignOut() {
    clearLoggedInUser();
    setAuthenticated(false);
    setCurrentUser(null);
    window.location.assign('/login');
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
            <span className="ink-account-row__avatar" aria-hidden="true">{initialsFor(displayName)}</span>
            <span className="ink-account-row__name">{displayName}</span>
          </div>
          <button className="ink-signout-row" type="button" onClick={handleSignOut}>
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
                <span className="ink-account-row__avatar" aria-hidden="true">{initialsFor(displayName)}</span>
                <span className="ink-account-row__name">{displayName}</span>
              </div>
              <button className="ink-signout-row" type="button" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="ink-app__content">{children}</div>
    </div>
  );
}

