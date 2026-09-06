import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import InkLockup from './InkLockup.jsx';
import ThemeToggle from './ink/ThemeToggle.jsx';
import { useT } from '../i18n/index.jsx';

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
 * The way out, on a phone.
 *
 * <p>Signup used to carry a bare "←" in a 44px box that pointed at /login. It
 * read as a back arrow, so it looked like it undid the last step, and it went
 * somewhere else entirely — and signin had no such control at all. Naming the
 * destination fixes both: it says where it goes, and it goes there.
 *
 * <p>Lives in the shell rather than in either page so the two cannot drift
 * apart again, and shows at every width. The dark panel's lockup is also a
 * link home on a wide screen, but it is a logo — it reads as branding, and
 * being the only exit made leaving something you had to know rather than
 * something you could see.
 */
function BackHome() {
  const t = useT();

  return (
    <Link className="ink-back-home" to="/">
      <ArrowLeft size={17} aria-hidden="true" />
      {t('auth.backToTrevora')}
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
        {/* Pinned to the top of the form column rather than dropped into one
            of the three brand rows below, which appear and disappear with the
            breakpoint — the switch has to be in the same place at every width,
            including the one where none of those rows is rendered. */}
        <div className="ink-auth__theme">
          <ThemeToggle compact />
        </div>

        {/* First in the column, so it is the first thing reached by tab and by
            a screen reader — a way out announced after the form is a way out
            nobody finds. */}
        <div className="ink-auth__back-row">
          <BackHome />
        </div>

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
