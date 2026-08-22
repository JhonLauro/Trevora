import React from 'react';
import InkLockup from './InkLockup.jsx';

/**
 * `mobileTitle` switches the <768px layout: when present the screen gets the
 * ink header with the paper sheet pulled up over it; when absent it is a
 * full-paper screen and the caller supplies its own top row.
 */
export default function InkAuthShell({ hero, lead, aside, mobileTitle, variant = 'signin', children }) {
  const isSheet = Boolean(mobileTitle);

  return (
    <div className={`ink-auth ${isSheet ? 'ink-auth--sheet' : 'ink-auth--paper'}`}>
      <aside className="ink-panel">
        <InkLockup />
        <div className="ink-panel__body">
          <h1 className="ink-panel__hero">{hero}</h1>
          <p className="ink-panel__lead">{lead}</p>
          {aside}
        </div>
        <p className="ink-panel__copyright">© 2026 Trevora</p>
      </aside>

      <div className="ink-auth__main">
        <div className="ink-auth__tablet-brand">
          <InkLockup tone="dark" />
        </div>

        {isSheet && (
          <header className="ink-auth__mobile-header">
            <InkLockup />
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
