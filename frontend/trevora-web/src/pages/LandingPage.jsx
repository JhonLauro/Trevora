import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ChevronDown, ImageIcon, Keyboard, Mic } from 'lucide-react';
import { isLoggedIn } from '../api/currentUser.js';
import TrevoraMark from '../components/TrevoraMark.jsx';
import ThemeToggle from '../components/ink/ThemeToggle.jsx';

/* Trevora landing — v2.
 *
 * Rebuilt from the "Trevora Landing v2" design board. Two things it does that
 * the previous page did not, and that are the reason it was redrawn:
 *
 * - It sells what the product does rather than what the category does. No
 *   percentages, no confidence scores, no "AI-powered" pill: the review screen
 *   reports in words, so the page does too, and the words here are the ones
 *   `utils/fieldConfidence.js` actually prints.
 * - It says out loud that Trevora does not remind you when something is due.
 *   Owners ask for that constantly; leaving it unsaid sold a feature the
 *   product deliberately does not have.
 *
 * Styling is styles/landing-v2.css under its own `.tvl-` prefix. The old
 * `.fig-*` rules in styles.css are no longer referenced by anything here.
 */

/* Photographs and screenshots are slots, not fixed assets — see ImageSlot
   below. Paths are relative to /public; drop a file in and it appears.

   The three view slots are drawn, not photographed: `.svg` files in
   /public/landing, built from the real components and the real tokens. A
   screenshot of a running app goes stale the week someone moves a button, and
   at 200px tall a screenshot of a full page is unreadable anyway — these say
   what each view is *for* at the size the page actually shows them.

   The showcase slots at the top are deliberately not drawn. A traced phone
   next to a real photograph of a receipt reads as a placeholder standing in
   for the thing the section is promising; the empty frame is the more honest
   of the two, and it says plainly that art is still to come. Those four want
   a camera, and stock would read as stock. */
const SHOTS = {
  receipt: { src: '/landing/receipt.jpg', label: 'Hand holding a shop receipt' },
  vehiclePage: { src: '/landing/vehicle-page.png', label: 'The vehicle page on a phone' },
  mechanic: { src: '/landing/mechanic.jpg', label: 'A mechanic scanning a phone' },
  timeline: { src: '/landing/view-timeline.svg', label: 'Timeline view' },
  components: { src: '/landing/view-components.svg', label: 'Component map' },
  table: { src: '/landing/view-table.svg', label: 'Table view' },
  page1: { src: '/landing/receipt-p1.jpg', label: 'Page 1' },
  page2: { src: '/landing/receipt-p2.jpg', label: 'Page 2' },
  page3: { src: '/landing/receipt-p3.jpg', label: 'Page 3' },
};

const WAYS_IN = [
  {
    icon: Camera,
    title: 'Photograph the receipt',
    text: 'The main path. Multi-page receipts are fine — the order you shoot them in is the order they keep.',
  },
  {
    icon: Mic,
    title: 'Say it out loud',
    text: 'In whatever language you said it in. You get the raw transcript first; translating is a separate tap you take.',
  },
  {
    icon: Keyboard,
    title: 'Type it in',
    text: 'For the service you remember but never got paper for, and the receipt that printed too faint to read.',
  },
];

/* The three tiers the review screen sorts every field into. Loudness tracks
   one thing only: whether the field stops you saving. */
const STOPPERS = ['Needed to save', 'Cannot be right'];
const WORTH_A_LOOK = ['Two different values found', 'Not on receipt', 'Check this one'];
const SOURCES = ['Read between the lines', 'Read from receipt', 'Heard in your note', 'You entered this'];

const HANDOFF_STEPS = [
  { title: 'They scan', note: 'No account, no app.' },
  { title: 'They ask', note: 'A request lands with you.' },
  { title: 'You approve', note: 'One vehicle. Revocable.', highlight: true },
  { title: 'They read', note: 'Read-only, and it expires.' },
];

const VIEWS = [
  { shot: SHOTS.timeline, title: 'Timeline', text: 'Newest first, with the empty years left visible as gaps.' },
  { shot: SHOTS.components, title: 'Components', text: 'A side-on map of your own vehicle. Two states: has records, or no record found.' },
  { shot: SHOTS.table, title: 'Table', text: 'Dates, shops and figures in columns, for when you want one number.' },
];

const FAQS = [
  ['Does my mechanic need an account?', 'No. They scan, you approve, they read. Access is read-only and expires.'],
  ['What if the receipt is unreadable?', 'Type it in instead. The record comes out the same.'],
  ['Can I keep more than one vehicle?', 'Yes — cars and motorcycles, each with its own page and history.'],
];

/**
 * A photograph that has not been shot yet still has to lay out. This renders
 * the real image once a file exists at `src`, and a labelled frame until then,
 * swapping back to the frame if the file 404s. No code change when the art
 * lands — only a file in /public/landing.
 */
function ImageSlot({ src, label }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="tvl-slot">
        <span className="tvl-slot__label">
          <ImageIcon aria-hidden="true" />
          {label}
        </span>
      </div>
    );
  }

  return (
    <div className="tvl-slot">
      <img className="tvl-slot__img" src={src} alt="" onError={() => setFailed(true)} />
    </div>
  );
}

export default function LandingPage() {
  const signedIn = isLoggedIn();
  const [openFaq, setOpenFaq] = useState(0);

  // A signed-in owner who lands here wants their garage, not a pitch.
  const primaryHref = signedIn ? '/' : '/register';
  const primaryLabel = signedIn ? 'Open Trevora' : 'Create an account';

  return (
    <main className="tvl">
      <header className="tvl-nav tvl-wrap">
        <div className="tvl-nav__bar">
          <Link className="tvl-nav__brand" to="/">
            <TrevoraMark />
            <span className="tvl-nav__word">Trevora</span>
          </Link>
          <nav className="tvl-nav__links" aria-label="Account">
            {/* Ahead of the links: it is a setting for the page you are on,
                not another way off it. */}
            <ThemeToggle compact />
            {!signedIn && (
              <Link className="tvl-nav__link" to="/login">
                Sign in
              </Link>
            )}
            <Link className="tvl-btn tvl-btn--primary" to={primaryHref}>
              {primaryLabel}
            </Link>
          </nav>
        </div>
      </header>

      <section className="tvl-hero tvl-wrap">
        <div className="tvl-glows" aria-hidden="true">
          <span className="tvl-glow tvl-glow--a" />
          <span className="tvl-glow tvl-glow--b" />
          <span className="tvl-glow tvl-glow--c" />
        </div>
        <h1 className="tvl-display tvl-hero__title">Every receipt becomes a record.</h1>
        <p className="tvl-lede tvl-hero__lede">
          Photograph it, say it out loud, or type it in. Trevora reads the paper, names every field
          it found, and saves nothing until you confirm it.
        </p>
        <div className="tvl-hero__actions">
          <Link className="tvl-btn tvl-btn--lg tvl-btn--primary" to={primaryHref}>
            {primaryLabel}
          </Link>
          {!signedIn && (
            <Link className="tvl-btn tvl-btn--lg tvl-btn--quiet" to="/login">
              Sign in
            </Link>
          )}
        </div>
        <p className="tvl-hero__fineprint">Private until you share it</p>
      </section>

      <section className="tvl-showcase tvl-wrap" aria-label="Trevora in use">
        <div className="tvl-shot">
          <ImageSlot {...SHOTS.receipt} />
          <div className="tvl-scan" aria-hidden="true">
            <span className="tvl-scan__line" />
            <span className="tvl-scan__tick tvl-scan__tick--tl" />
            <span className="tvl-scan__tick tvl-scan__tick--tr" />
            <span className="tvl-scan__tick tvl-scan__tick--br" />
          </div>
          <p className="tvl-saved">
            <span className="tvl-saved__dot" aria-hidden="true" />
            <span className="tvl-saved__text">Record saved · 7 May 2026 · Toyota Otis, Manila</span>
          </p>
        </div>
        <div className="tvl-shot-card">
          <div className="tvl-shot-card__frame">
            <ImageSlot {...SHOTS.vehiclePage} />
          </div>
          <p className="tvl-shot-card__title">Your vehicle page</p>
          <p className="tvl-shot-card__note">Everything you have confirmed, in one place.</p>
        </div>
      </section>

      <section className="tvl-section tvl-wrap" aria-labelledby="tvl-ways-title">
        <div className="tvl-section__head">
          <p className="tvl-eyebrow">Getting it in</p>
          <h2 className="tvl-display tvl-section__title" id="tvl-ways-title">
            Three ways in. One review screen.
          </h2>
          <p className="tvl-lede">
            However it arrives, you check the same fields and the record comes out the same.
          </p>
        </div>
        <div className="tvl-ways">
          {WAYS_IN.map(({ icon: Icon, title, text }) => (
            <article className="tvl-way" key={title}>
              <span className="tvl-way__icon">
                <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <h3 className="tvl-way__title">{title}</h3>
              <p className="tvl-way__text">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="tvl-split tvl-wrap" aria-labelledby="tvl-check-title">
        <div className="tvl-split__copy">
          <p className="tvl-eyebrow">Checking it</p>
          <h2 className="tvl-display tvl-section__title" id="tvl-check-title">
            No scores. No percentages. Words.
          </h2>
          <p className="tvl-lede" style={{ maxWidth: '470px' }}>
            Each field says where its value came from, or what is wrong with it. How loudly it says
            it depends on one thing: whether it stops you saving.
          </p>

          <div className="tvl-tiers">
            <div className="tvl-tier tvl-tier--stop">
              <p className="tvl-tier__label">Stops the save</p>
              <ul className="tvl-chips">
                {STOPPERS.map((chip) => (
                  <li className="tvl-chip tvl-chip--stop" key={chip}>
                    {chip}
                  </li>
                ))}
              </ul>
            </div>
            <div className="tvl-tier tvl-tier--look">
              <p className="tvl-tier__label">Worth a look</p>
              <ul className="tvl-chips">
                {WORTH_A_LOOK.map((chip) => (
                  <li className="tvl-chip tvl-chip--look" key={chip}>
                    {chip}
                  </li>
                ))}
              </ul>
            </div>
            <div className="tvl-tier tvl-tier--source">
              <p className="tvl-tier__label">Just where it came from</p>
              <ul className="tvl-sources">
                {SOURCES.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* A still of the review screen, not a live one: it shows the two
            things the copy above claims — a per-field source, and the line
            total checked against the printed total without either being
            silently corrected. */}
        <div className="tvl-review" aria-label="Example of the review screen">
          <div className="tvl-review__head">
            <strong>Review · 4 fields read</strong>
            <span className="tvl-review__page">page 1 / 3</span>
          </div>
          <div className="tvl-review__body">
            <div className="tvl-review__pages">
              {[SHOTS.page1, SHOTS.page2, SHOTS.page3].map((shot) => (
                <div className="tvl-review__thumb" key={shot.src}>
                  <ImageSlot {...shot} />
                </div>
              ))}
            </div>

            <div className="tvl-row">
              <span className="tvl-row__field">
                <span className="tvl-row__label">Service date</span>
                <span className="tvl-row__value">7 May 2026</span>
              </span>
              <span className="tvl-row__source">Read from receipt</span>
            </div>
            <div className="tvl-row">
              <span className="tvl-row__field">
                <span className="tvl-row__label">Shop</span>
                <span className="tvl-row__value">Toyota Otis, Manila</span>
              </span>
              <span className="tvl-row__source">Read from receipt</span>
            </div>
            <div className="tvl-row tvl-row--flagged">
              <span className="tvl-row__field">
                <span className="tvl-row__label">Odometer</span>
                <span className="tvl-row__value">42,180 km</span>
              </span>
              <span className="tvl-row__flag">Check this one</span>
            </div>

            <div className="tvl-mismatch">
              <span className="tvl-mismatch__line">
                <span>Lines add up to</span>
                <strong>₱7,650</strong>
              </span>
              <span className="tvl-mismatch__line">
                <span>Printed total</span>
                <strong>₱7,850</strong>
              </span>
              <p className="tvl-mismatch__note">
                ₱200 apart. Neither figure has been changed — you are holding the paper.
              </p>
            </div>

            <div className="tvl-review__confirm">
              <span className="tvl-review__fake-btn">Confirm and save</span>
              <span className="tvl-review__hint">Nothing saved until you do</span>
            </div>
          </div>
        </div>
      </section>

      <section className="tvl-wrap" aria-labelledby="tvl-handoff-title">
        <div className="tvl-handoff">
          <div className="tvl-handoff__copy">
            <p className="tvl-eyebrow">Handing it to a mechanic</p>
            <h2 className="tvl-display tvl-section__title" id="tvl-handoff-title">
              They ask. You approve. Then they can read.
            </h2>
            <p className="tvl-handoff__lede">
              Scanning your code does not open anything — it sends you a request. Nothing is visible
              until you say yes, for one vehicle, and you can turn it off again.
            </p>
            <ol className="tvl-steps">
              {HANDOFF_STEPS.map(({ title, note, highlight }) => (
                <li className={`tvl-step ${highlight ? 'tvl-step--you' : ''}`.trim()} key={title}>
                  <p className="tvl-step__title">{title}</p>
                  <p className="tvl-step__note">{note}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="tvl-handoff__shot">
            <ImageSlot {...SHOTS.mechanic} />
          </div>
        </div>
      </section>

      <section className="tvl-section tvl-wrap" aria-labelledby="tvl-views-title">
        <div className="tvl-views-head">
          <h2 className="tvl-display tvl-views-head__title" id="tvl-views-title">
            One page per vehicle. Three ways to read it.
          </h2>
          <p className="tvl-views-head__note">
            Confirmed records carry a plain-language note: what was done, why it matters, what to
            watch for.
          </p>
        </div>
        <div className="tvl-views">
          {VIEWS.map(({ shot, title, text }) => (
            <article className="tvl-view" key={title}>
              <div className="tvl-view__frame">
                <ImageSlot {...shot} />
              </div>
              <h3 className="tvl-view__title">{title}</h3>
              <p className="tvl-view__text">{text}</p>
            </article>
          ))}
        </div>
        <p className="tvl-nopredict">
          Trevora does not tell you when something is next due. No intervals, no reminders, no
          predictions — it keeps the record of what happened and leaves the judgement to you and
          your mechanic.
        </p>
      </section>

      <section className="tvl-close tvl-wrap" aria-labelledby="tvl-close-title">
        <div className="tvl-close__copy">
          <h2 className="tvl-display tvl-close__title" id="tvl-close-title">
            Start with the last receipt in the glovebox.
          </h2>
          <p className="tvl-close__lede">
            One photo is a record. A year of photos is a history worth showing a buyer.
          </p>
          <div className="tvl-close__actions">
            <Link className="tvl-btn tvl-btn--lg tvl-btn--primary" to={primaryHref}>
              {primaryLabel}
            </Link>
            {!signedIn && (
              <Link className="tvl-btn tvl-btn--lg tvl-btn--quiet" to="/login">
                Sign in
              </Link>
            )}
          </div>
        </div>

        <div className="tvl-faq">
          {FAQS.map(([question, answer], index) => {
            const open = openFaq === index;
            const panelId = `tvl-faq-${index}`;
            return (
              <div className="tvl-faq__item" data-open={open} key={question}>
                <button
                  className="tvl-faq__q"
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenFaq(open ? -1 : index)}
                >
                  {question}
                  <ChevronDown size={20} aria-hidden="true" />
                </button>
                {open && (
                  <p className="tvl-faq__a" id={panelId}>
                    {answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <footer className="tvl-footer tvl-wrap">
        <div className="tvl-footer__inner">
          <span className="tvl-footer__mark">Trevora</span>
          <div className="tvl-footer__links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            {!signedIn && <Link to="/login">Sign in</Link>}
            <Link to={primaryHref}>{primaryLabel}</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
