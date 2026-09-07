import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import GarageTransition from '../components/GarageTransition.jsx';
import InkLockup from '../components/InkLockup.jsx';
import { isLoggedIn } from '../api/currentUser.js';
import { markOnboardingStep } from '../api/onboarding.js';
import { hasSeenWalkthrough, markWalkthroughSeen } from '../api/walkthrough.js';
import { getVehicles } from '../api/vehicles.js';

/**
 * Where this page hands off to.
 *
 * <p>It always sent everyone to the vehicle form, which was right while only
 * brand-new accounts could reach it. An owner who has never been shown the
 * walkthrough but already has cars — a profile reused by email, say — would
 * otherwise finish the tour and land on "add your first vehicle".
 *
 * <p>Failures answer with the vehicle form: that is the safe direction, since
 * an owner sent there who already has cars can still navigate away, while one
 * sent to an empty garage has no obvious next move.
 */
async function onwardRoute() {
  try {
    const vehicles = await getVehicles();
    return Array.isArray(vehicles) && vehicles.length > 0 ? '/vehicles' : '/register/vehicle';
  } catch {
    return '/register/vehicle';
  }
}

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

/* Scanning this in the walkthrough decodes to a sentence, not a link. It is a
   picture of the real thing on a screen that says so. */
const PREVIEW_QR_TEXT =
  'Trevora walkthrough preview - this is an example code and grants no access.';

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
        {/* Only the table scrolls. The head used to scroll with it, so
            reaching the Flag column carried "Step 4 of 6" off the left
            edge -- the label that says where you are, leaving. */}
        <div className="wt-screen__scroll">
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
        </div>
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
    ['24 Oct 2025', 'Tires, front pair', 'Rimtek, Mandaue · Voice note', '31,020 km', '4,564'],
  ];

  return (
    <div className="wt-preview wt-preview--history">
      <div className="wt-screen">
        <div className="wt-toolbar">
          <span className="wt-search">Search service, part, shop, or notes</span>
          <span className="wt-count">3 records</span>
        </div>
        {/* Only the table scrolls. The head used to scroll with it, so
            reaching the Flag column carried "Step 4 of 6" off the left
            edge -- the label that says where you are, leaving. */}
        <div className="wt-screen__scroll">
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
        {/* A real, scannable QR code that grants nothing. The old one was a
            6x6 grid of squares switched on by `index % 3`, which reads as a
            chequerboard rather than as a code — no finder squares, no quiet
            zone, nothing a phone would even try to decode.

            It encodes a sentence rather than a URL on purpose: a mechanic who
            points a phone at the walkthrough gets told what they are looking
            at, instead of being sent to a link that cannot work. */}
        <div className="wt-qr" aria-hidden="true">
          <QRCodeSVG
            value={PREVIEW_QR_TEXT}
            size={132}
            level="M"
            marginSize={2}
            bgColor="#ffffff"
            fgColor="#16211c"
          />
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

/* --- The heading, typed -------------------------------------------------- */

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * The step heading, revealed a character at a time.
 *
 * <p>Two things this deliberately does not do. It does not animate the text a
 * screen reader sees — the full heading is in the DOM from the first frame and
 * the typed copy is `aria-hidden`, because a heading announced one character
 * at a time is not an effect, it is a fault. And it does not run at a fixed
 * rate: the interval is derived from the length so every heading finishes in
 * about the same second, rather than the long ones dragging.
 *
 * <p>Under `prefers-reduced-motion` the whole thing is skipped and the text is
 * simply there.
 *
 * <p>`onDone` fires when the last character lands — the preview below waits on
 * it rather than on a guessed delay, so the two stay in step when the copy
 * changes length.
 */
function TypedHeading({ text, onDone }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? text.length : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(text.length);
      return undefined;
    }

    setShown(0);
    const step = Math.max(12, Math.min(26, Math.round(1100 / text.length)));
    const timer = window.setInterval(() => {
      setShown((current) => {
        if (current >= text.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, step);

    return () => window.clearInterval(timer);
  }, [text]);

  const done = shown >= text.length;

  /* Reported from an effect rather than from inside the state updater:
     StrictMode calls updaters twice in development to surface impure ones,
     and a callback fired in there runs twice per character. */
  useEffect(() => {
    if (done) onDone?.();
  }, [done, onDone]);

  return (
    <h1 className="wt-title">
      <span className="ink-sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        <span className="wt-caret" data-done={done ? 'true' : 'false'} />
      </span>
    </h1>
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

/* Steps do not advance themselves any more, so there is no Pause control
   either. Removing the button while keeping a seven-second timer would have
   failed WCAG 2.2.2 -- content that moves on for longer than five seconds has
   to be stoppable -- and, worse than the rule, it would take the walkthrough
   away from the reader who most needs it: the slow one, now with no way to
   hold a screen still and no way to skip out. The reader advances it.

   The countdown was also the only thing the stepper's fill animation drew, so
   `wt-foot` now reports auto="off" permanently -- a state that stylesheet
   already handles. */

/* How long the car gets before the route changes underneath it. Keep this in
   step with `--gt-run` in styles/garage-transition.css - the car leaves the
   frame in the last fifth of it, so a mismatch either cuts it off mid-road or
   leaves an empty mint screen sitting there after it has gone. */
const LEAVE_ANIMATION_MS = 5000;

export default function WelcomePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  /* Which step's heading has finished typing. The preview and the final CTA
     wait on this rather than on a fixed delay — a longer headline should push
     them later, not overlap them. Comparing against `step` means it resets
     itself on every move without a second piece of state to clear. */
  const [typedStep, setTypedStep] = useState(-1);
  const [leaving, setLeaving] = useState(false);
  const leaveTimerRef = useRef(null);
  /* Two clicks landing in the same frame both read the pre-click `step`, and
     with a functional updater that advances twice — one step skipped, and the
     one skipped is a whole screen of the product. The disabled state below
     closes most of that window; this closes the rest of it. */
  const movingRef = useRef(false);
  /* Until the profile answers, the page renders rather than flashing a spinner
     -- a returning owner is redirected a moment later, and a new one sees the
     first step immediately instead of a blank screen. */
  const [checked, setChecked] = useState(false);
  /* Resolved before either exit needs it, so neither has to guess. */
  const [onward, setOnward] = useState('/register/vehicle');
  const signedIn = isLoggedIn();

  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;

    /* Both answers together, not one then the other: the redirect below fires
       the moment `seen` resolves, and if the destination were still loading it
       would send a returning owner to the wrong one. */
    Promise.all([hasSeenWalkthrough(), onwardRoute()]).then(([seen, route]) => {
      if (!active) return;
      setOnward(route);
      setChecked(true);
      /* Shown once. A refresh, a back button or a second signup tab all land
         here, and none of them should replay it. */
      if (seen) navigate(route, { replace: true });
    });

    return () => { active = false; };
  }, [navigate, signedIn]);

  /* Both ways out record the same thing: it has been shown. The navigation
     does not wait on the write -- a failed request must not strand anyone
     mid-signup, and the worst case is seeing this once more. */
  const leave = useCallback(() => {
    markWalkthroughSeen();
    /* Locally too, and before navigating. The POST above is not awaited, so
       the gate on the next page would otherwise ask a server that has not
       written the flag yet and send this owner straight back here. */
    markOnboardingStep({ walkthroughDone: true });
    navigate(onward, { replace: true });
  }, [navigate, onward]);

  /* The finishing CTA gets the hand-off animation; Skip does not. Somebody
     taking Skip has said they want out of this, and a second of car is the
     opposite of honouring that. */
  const startLeaving = useCallback(() => {
    if (prefersReducedMotion()) {
      leave();
      return;
    }
    setLeaving(true);
    leaveTimerRef.current = window.setTimeout(leave, LEAVE_ANIMATION_MS);
  }, [leave]);

  /* Five seconds is a long time to hold somebody who has decided to move on,
     and this screen is on the path of every new owner — including the one
     demoing it for the fourth time. Any click or key cuts it short and goes
     straight to the form. The listeners attach after the click that started
     it has already been dispatched, so that first click cannot skip its own
     animation. */
  useEffect(() => {
    if (!leaving) return undefined;

    function skip() {
      window.clearTimeout(leaveTimerRef.current);
      leave();
    }

    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    return () => {
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [leaving, leave]);

  /* Unmounting mid-animation must not navigate a page that has gone. */
  useEffect(() => () => window.clearTimeout(leaveTimerRef.current), []);

  const go = useCallback((next) => {
    if (movingRef.current) return;
    const target = Math.max(0, Math.min(LAST, next));
    setStep((current) => {
      if (current === target) return current;
      movingRef.current = true;
      return target;
    });
  }, []);

  /* Released once the new step has rendered. Effects run after commit, so by
     the time this fires the disabled state is on the button too. */
  useEffect(() => {
    movingRef.current = false;
  }, [step]);

  const current = useMemo(() => STEPS[step], [step]);
  const headingDone = typedStep === step;
  const markTyped = useCallback(() => setTypedStep(step), [step]);
  const canAdvance = headingDone && step < LAST;

  useEffect(() => {
    function onKeyDown(event) {
      // Forward is gated on the heading the same way the button is; back is
      // not — leaving a step early is always allowed.
      if (event.key === 'ArrowRight' && headingDone) go(step + 1);
      if (event.key === 'ArrowLeft') go(step - 1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go, headingDone, step]);

  if (!signedIn) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="wt-page" data-checked={checked ? 'true' : 'false'}>
      {leaving && <GarageTransition />}
      {/* No skip. A new account cannot reach the app until this is finished,
          so an exit here would only strand somebody on a page the router sends
          straight back. The way out is the last step's button. */}
      <header className="wt-masthead">
        <InkLockup />
      </header>

      {/* `key` is the animation. Changing it remounts the stage, so the CSS
          entry transition on .wt-stage runs again on every step instead of
          only on first paint — no animation library, and no state to keep in
          sync with the step index. */}
      <section className="wt-stage" key={current.id} data-step={current.id} aria-live="polite">
        <p className="wt-eyebrow">{current.eyebrow}</p>
        <TypedHeading text={current.title} onDone={markTyped} />
        <p className="wt-body">{current.body}</p>

        {current.preview && (
          <figure className={`wt-frame${headingDone ? ' is-in' : ''}`}>
            {current.preview}
          </figure>
        )}

        {step === LAST && (
          <div className={`wt-cta${headingDone ? ' is-in' : ''}`}>
            <button
              className="ink-button ink-button--primary"
              type="button"
              disabled={leaving}
              onClick={startLeaving}
            >
              Add your first vehicle
            </button>
          </div>
        )}
      </section>

      <nav className="wt-foot" aria-label="Walkthrough steps" data-auto="off">
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
          <button className="wt-foot__next" type="button" disabled={leaving} onClick={startLeaving}>
            Add your first vehicle
          </button>
        ) : (
          <button
            className="wt-foot__next"
            type="button"
            /* Locked until the step has finished arriving. Without it a fast
               second click lands while the heading is still typing and the
               reader is two screens on from what they last read. */
            disabled={!canAdvance}
            onClick={() => go(step + 1)}
          >
            Next
          </button>
        )}
      </nav>
    </main>
  );
}
