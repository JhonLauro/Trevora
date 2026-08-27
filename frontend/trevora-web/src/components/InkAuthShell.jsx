import React from 'react';
import { Link } from 'react-router-dom';
import InkLockup from './InkLockup.jsx';

/* The lockup is the way back out of the auth screens. Someone who lands on
   /login from a shared link and wants to know what Trevora is has no other
   exit — every other control on the page commits them to an account. */
function HomeLockup({ tone }) {
  return (
    <Link className="ink-lockup-link" to="/" aria-label="Trevora, back to the home page">
      <InkLockup tone={tone} />
    </Link>
  );
}

/**
 * `mobileTitle` switches the <768px layout: when present the screen gets the
 * ink header with the paper sheet pulled up over it; when absent it is a
 * full-paper screen and the caller supplies its own top row.
 */
export default function InkAuthShell({ hero, lead, aside, mobileTitle, variant = 'signin', children }) {
  const isSheet = Boolean(mobileTitle);

  // The variant reaches the root as well as the column: the headline in the
  // dark panel is measured per screen, and only the root is an ancestor of
  // both halves.
  return (
    <div className={`ink-auth ink-auth--${variant} ${isSheet ? 'ink-auth--sheet' : 'ink-auth--paper'}`}>
      <aside className="ink-panel">
        <HomeLockup />
        <div className="ink-panel__body">
          <h1 className="ink-panel__hero">{hero}</h1>
          <p className="ink-panel__lead">{lead}</p>
          {aside}
        </div>
        <p className="ink-panel__copyright">© 2026 Trevora</p>
      </aside>

      <div className="ink-auth__main">
        <div className="ink-auth__tablet-brand">
          <HomeLockup tone="dark" />
        </div>

        {isSheet && (
          <header className="ink-auth__mobile-header">
            <HomeLockup />
            <p className="ink-auth__mobile-title">{mobileTitle}</p>
          </header>
        )}

        <div className="ink-auth__sheet">
          <div className={`ink-auth__column ink-auth__column--${variant}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
