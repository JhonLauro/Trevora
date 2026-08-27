import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import InkLockup from '../components/InkLockup.jsx';
import { isLoggedIn } from '../api/currentUser.js';
import { hasSeenWalkthrough, markWalkthroughSeen } from '../api/walkthrough.js';

/**
 * The onboarding walkthrough, shown once between creating an account and
 * adding the first vehicle.
 *
 * <p>Six positions -- a welcome, one per part of the app, and a hand-off --
 * over four **mock previews**. Every preview on this page is a static
 * illustration: hardcoded strings, no API module imported, nothing that can
 * create a draft or a record. That is deliberate and worth keeping. An owner
 * arriving here has no vehicle, so there is no real garage, no draft and no
 * history to point at, and inventing one in their account to have something to
 * show would be a far worse answer than a picture that says it is a picture.
 *
 * <p>The copy came from a design mockup and was checked against the source
 * before it was used. Three things in it were wrong and are corrected here:
 * the review flags are the plain-language labels `utils/fieldConfidence.js`
 * actually prints rather than the retired High/Medium/Low grades, the input
 * methods carry the names `ServiceInputMethodPage` gives them, and granted
 * access lasts **four** hours -- 24 hours is the life of the QR link, which is
 * a different clock (`QRAccessService` vs `AccessApprovalService`).
 */

/* --- The four previews ---------------------------------------------------
   Each is drawn from the app's own primitives so the real screen is
   recognisable when the owner reaches it, and each is framed and tagged so it
   cannot be mistaken for their own records. */

function CapturePreview() {
  return (
    <div className="wt-preview wt-preview--capture">
      <div className="wt-shot">
        <span className="wt-shot__tag">receipt photo</span>
        <span className="wt-shot__name">IMG_2841.jpg</span>
        <span className="wt-shot__meta">1 page</span>
      </div>
      <div className="wt-arrow" aria-hidden="true">
        <span className="wt-arrow__label">reads</span>
        <span className="wt-arrow__glyph">→</span>
      </div>
      <div className="wt-filled">
        <p className="wt-filled__head">Filled from the photo</p>
        <dl>
          <div><dt>Date of service</dt><dd>7 May 2026</dd></div>
          <div><dt>Service type</dt><dd>Oil change + brake service</dd></div>
          <div><dt>Shop</dt><dd>Toyota Talisay, Cebu</dd></div>
          <div><dt>Total cost</dt><dd className="ink-mono">PHP 7,850</dd></div>
        </dl>
      </div>
    </div>
  );
}

function MethodList() {
  /* Names and the badge come from ServiceInputMethodPage: "Photo of the
     receipt" is Recommended there, not "Fastest". */
  const methods = [
    ['01', 'Photo of the receipt', 'Recommended'],
    ['02', 'Voice note', null],
    ['03', 'Type it in', null],
  ];

  return (
    <ol className="wt-methods">
      {methods.map(([number, name, badge]) => (
        <li key={name}>
          <span className="wt-methods__num">{number}</span>
          <span className="wt-methods__name">{name}</span>
          {badge && <span className="wt-methods__badge">{badge}</span>}
        </li>
      ))}
    </ol>
  );
}

function ReviewPreview() {
  /* The flags are the strings fieldSignal returns. The grades this mockup
     shipped with -- High, Medium, Low, Not found -- were retired from the
     product on the grounds that a category an owner can act on beats a score. */
  const rows = [
    ['Date of service', '7 May 2026', 'Read from receipt', 'ok'],
    ['Total cost', 'PHP 7,850', 'Read from receipt', 'ok'],
    ['Parts replaced', 'Oil filter, brake pads (front only)', 'Check this one', 'warn'],
    ['Work performed', 'Oil drain and refill…', 'Read between the lines', 'quiet'],
    ['Odometer', '—', 'Not on receipt', 'warn'],
  ];

  return (
    <div className="wt-preview wt-preview--review">
      <div className="wt-screen">
        <div className="wt-screen__head">
          <span className="wt-screen__title">Check the details</span>
          <span className="wt-screen__step">Step 4 of 6</span>
        </div>
        <table className="wt-fields">
          <thead>
            <tr>
              <th>Field</th>
              <th>What we read</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([field, value, flag, tone]) => (
              <tr key={field}>
                <td>{field}</td>
                <td className={value === '—' ? 'wt-fields__empty' : undefined}>{value}</td>
                <td><span className={`wt-flag wt-flag--${tone}`}>{flag}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="wt-screen__foot">Nothing is saved until you confirm it.</p>
      </div>
    </div>
  );
}

function HistoryPreview() {
  /* Columns match RecordsTable: date, service, odometer, cost, status.
     The status is "Needs review", not "Validated", and that is not a
     pessimistic mockup — `utils/recordStatus.js` returns exactly that for
     any record without a `validationStatus`, and the backend does not expose
     one on confirmed records yet. This preview shipped with a green
     "Validated" on all three rows, which is the same false claim migration
     009 exists to prevent and the same one the record detail page and the
     mechanic view both had removed. Showing it here taught owners to expect
     a badge the app will never give them. */
  const records = [
    ['24 Aug 2026', 'Preventive maintenance', 'Toyota Talisay', '42,190 km', '10,586'],
    ['7 May 2026', 'Oil change + brake service', 'Toyota Talisay', '38,400 km', '7,850'],
    ['24 Oct 2025', 'Tyres, front pair', 'Rimtek, Mandaue · Voice note', '31,020 km', '4,564'],
  ];

  return (
    <div className="wt-preview wt-preview--history">
      <div className="wt-screen">
        <div className="wt-toolbar">
          <span className="wt-search">Search service, part, shop, or notes</span>
          <span className="wt-count">3 records</span>
        </div>
        <table className="wt-records">
          <thead>
            <tr>
              <th>Date</th>
              <th>Service</th>
              <th>Odometer</th>
              <th>Cost (PHP)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map(([date, what, where, odometer, cost]) => (
              <tr key={date}>
                <td className="wt-records__date">{date}</td>
                <td>
                  <span className="wt-records__what">{what}</span>
                  <span className="wt-records__where">{where}</span>
                </td>
                <td className="ink-mono">{odometer}</td>
                <td className="ink-mono">{cost}</td>
                <td><span className="wt-flag wt-flag--warn">Needs review</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SharePreview() {
  const stages = [
    ['01', 'You generate a code', 'One code, one vehicle.'],
    ['02', 'The mechanic scans', 'The scan grants nothing on its own.'],
    ['03', 'You approve', 'Read-only, confirmed records only.'],
    ['04', 'Access ends', 'By itself after four hours, or sooner if you revoke it.'],
  ];

  return (
    <div className="wt-preview wt-preview--share">
      <div className="wt-share-top">
        <div className="wt-qr" aria-hidden="true">
          {Array.from({ length: 36 }, (unused, index) => (
            <span key={index} className={index % 3 === 0 || index % 7 === 0 ? 'is-on' : undefined} />
          ))}
        </div>
        <div className="wt-request">
          <p className="wt-request__eyebrow">Access request</p>
          <p className="wt-request__who">Rimtek, Mandaue</p>
          <p className="wt-request__what">Asking to view confirmed records for 2025 Toyota Vios.</p>
          <div className="wt-request__actions">
            <span className="wt-request__approve">Approve</span>
            <span className="wt-request__decline">Decline</span>
          </div>
        </div>
      </div>
      <ol className="wt-stages">
        {stages.map(([number, title, body]) => (
          <li key={number}>
            <span className="wt-stages__num">{number}</span>
            <span className="wt-stages__title">{title}</span>
            <span className="wt-stages__body">{body}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* --- The six positions --------------------------------------------------- */

const STEPS = [
  {
    id: 'welcome',
    label: 'Welcome',
    eyebrow: 'Welcome to Trevora',
    title: 'Nothing about your car should live in a shoebox.',
    body: 'Four short steps: snap it, check it, keep it, share it. Every screen ahead is a mockup — nothing here is live yet.',
    preview: null,
  },
  {
    id: 'capture',
    label: 'Capture',
    eyebrow: '01 · Capture',
    title: 'Snap the receipt. We’ll do the typing.',
    body: 'Point your camera at the paper and the fields fill themselves. Prefer talking? A voice note works. Prefer typing? That works too.',
    preview: (
      <>
        <CapturePreview />
        <MethodList />
      </>
    ),
  },
  {
    id: 'review',
    label: 'Review',
    eyebrow: '02 · Review',
    title: 'The AI reads. You have the last word.',
    body: 'Every field says where its value came from, and anything uncertain is flagged in plain words. Correct what looks off. Nothing is saved until you say so.',
    preview: <ReviewPreview />,
  },
  {
    id: 'history',
    label: 'History',
    eyebrow: '03 · History',
    title: 'One vehicle, one story, in order.',
    body: 'Confirmed records stack up date by date. Search a service, a part, a shop or a note. A record carries its own status — nothing is marked validated on your behalf.',
    preview: <HistoryPreview />,
  },
  {
    id: 'share',
    label: 'Share',
    eyebrow: '04 · Share',
    title: 'A mechanic can ask. Only you can grant.',
    body: 'Scanning only asks. Nothing opens until you approve, and what you grant is read-only, one vehicle, and closes itself after four hours.',
    preview: <SharePreview />,
  },
  {
    id: 'start',
    label: 'Start',
    eyebrow: 'Ready',
    title: 'Your garage is empty. Let’s change that.',
    body: 'Add the vehicle you drive most. Everything you just saw hangs off it — records, history, and what a mechanic is allowed to see.',
    preview: null,
  },
];

const LAST = STEPS.length - 1;

export default function WelcomePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  /* Until the profile answers, the page renders rather than flashing a spinner
     -- a returning owner is redirected a moment later, and a new one sees the
     first step immediately instead of a blank screen. */
  const [checked, setChecked] = useState(false);
  const signedIn = isLoggedIn();

  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;

    hasSeenWalkthrough().then((seen) => {
      if (!active) return;
      setChecked(true);
      /* Shown once. A refresh, a back button or a second signup tab all land
         here, and none of them should replay it. */
      if (seen) navigate('/register/vehicle', { replace: true });
    });

    return () => { active = false; };
  }, [navigate, signedIn]);

  /* Both ways out record the same thing: it has been shown. The navigation
     does not wait on the write -- a failed request must not strand anyone
     mid-signup, and the worst case is seeing this once more. */
  const leave = useCallback(() => {
    markWalkthroughSeen();
    navigate('/register/vehicle', { replace: true });
  }, [navigate]);

  const go = useCallback((next) => {
    setStep(Math.max(0, Math.min(LAST, next)));
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'ArrowRight') go(step + 1);
      if (event.key === 'ArrowLeft') go(step - 1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go, step]);

  const current = useMemo(() => STEPS[step], [step]);

  if (!signedIn) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="wt-page" data-checked={checked ? 'true' : 'false'}>
      <header className="wt-masthead">
        <InkLockup />
        {/* Quiet, and available on every step. Taking it counts as having been
            shown the walkthrough -- somebody who declines it has answered, and
            asking again next time would be ignoring the answer. */}
        <button className="wt-skip" type="button" onClick={leave}>Skip walkthrough</button>
      </header>

      {/* `key` is the animation. Changing it remounts the stage, so the CSS
          entry transition on .wt-stage runs again on every step instead of
          only on first paint — no animation library, and no state to keep in
          sync with the step index. */}
      <section className="wt-stage" key={current.id} data-step={current.id} aria-live="polite">
        <p className="wt-eyebrow">{current.eyebrow}</p>
        <h1 className="wt-title">{current.title}</h1>
        <p className="wt-body">{current.body}</p>

        {current.preview && (
          <figure className="wt-frame">
            <figcaption className="wt-frame__tag">Mockup — not your records</figcaption>
            {current.preview}
          </figure>
        )}

        {step === LAST && (
          <div className="wt-cta">
            <button className="ink-button ink-button--primary" type="button" onClick={leave}>
              Add your first vehicle
            </button>
          </div>
        )}
      </section>

      <nav className="wt-foot" aria-label="Walkthrough steps">
        <button
          className="wt-foot__back"
          type="button"
          onClick={() => go(step - 1)}
          disabled={step === 0}
        >
          Back
        </button>

        <ol className="wt-stepper">
          {STEPS.map((entry, index) => (
            <li key={entry.id}>
              <button
                type="button"
                className={`wt-stepper__dot${index === step ? ' is-active' : ''}${index < step ? ' is-done' : ''}`}
                aria-current={index === step ? 'step' : undefined}
                onClick={() => go(index)}
              >
                <span className="wt-stepper__bar" aria-hidden="true" />
                <span className="wt-stepper__label">{entry.label}</span>
              </button>
            </li>
          ))}
        </ol>

        {step === LAST ? (
          <button className="wt-foot__next" type="button" onClick={leave}>Add your first vehicle</button>
        ) : (
          <button className="wt-foot__next" type="button" onClick={() => go(step + 1)}>Next</button>
        )}
      </nav>
    </main>
  );
}
