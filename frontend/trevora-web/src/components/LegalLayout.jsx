import React from 'react';
import { Link } from 'react-router-dom';
import InkLockup from './InkLockup.jsx';

/**
 * The frame for the Terms and the Privacy Policy.
 *
 * <p>Both are reachable signed out — the account form links to them, and
 * somebody deciding whether to agree must be able to read them without an
 * account. So this is its own shell, not `AppShell`.
 *
 * <p>The two documents are kept deliberately short and specific. They describe
 * what this system actually does, checked against the code: which third
 * parties receive what, how long a mechanic's access lasts, what is stored and
 * what is not. Generic boilerplate would have been faster and would have
 * described a product that does not exist.
 */
export default function LegalLayout({ title, updated, children }) {
  return (
    <div className="legal">
      <header className="legal__bar">
        <Link className="ink-lockup-link" to="/" aria-label="Trevora, back to the home page">
          <InkLockup />
        </Link>
        <nav className="legal__nav" aria-label="Legal documents">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </header>

      <main className="legal__body">
        <div className="legal__intro">
          <h1 className="legal__title">{title}</h1>
          <p className="legal__updated">Last updated {updated}</p>
        </div>
        <article className="legal__doc">{children}</article>
      </main>

      <footer className="legal__footer">
        <Link to="/">Back to Trevora</Link>
      </footer>
    </div>
  );
}
