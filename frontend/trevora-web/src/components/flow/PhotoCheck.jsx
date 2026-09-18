import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n/index.jsx';
import { qualityMeters } from '../../utils/receiptImage';

const BUBBLE_WIDTH = 256;
const EDGE = 12;
const GAP = 10;

/**
 * How one photo measured against the limits the reader was calibrated on.
 *
 * A small "Photo check" button on the card, its dot amber when something needs
 * a look and green when nothing does, that opens a
 * speech bubble pointing at it. The detail used to unfold inside the card and
 * push the Replace/Remove row down a card that is only 170px wide; a bubble
 * sits over the page instead and goes away on a tap outside or Escape.
 *
 * Inside, one plain bar per measure, coloured by its verdict -- green reads,
 * amber may misread, red will not -- and drawn to a length that agrees with it
 * (see barLength).
 *
 * Portalled to <body>: the card clips its overflow for the photo's rounded
 * corners, and a bubble inside it would be cut off at the card's edge.
 *
 * Renders nothing for a page that was not measured (a format the browser cannot
 * open), rather than an empty bubble.
 */
export default function PhotoCheck({ measured }) {
  const t = useT();
  const meters = qualityMeters(measured);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const buttonRef = useRef(null);
  const bubbleRef = useRef(null);
  const bubbleId = useId();

  const flagged = meters.filter((meter) => meter.zone !== 'ok').length;
  const status = flagged ? t('photoCheck.toReview', { count: flagged }) : t('photoCheck.allGood');

  // Below the button when it fits, above when it does not, and on whichever
  // side has more room when neither does -- scrolling inside rather than
  // running off the screen. Kept inside the viewport sideways, with the tail
  // still pointing at the button's middle.
  const position = useCallback(() => {
    const button = buttonRef.current;
    const bubble = bubbleRef.current;
    if (!button || !bubble) return;
    const anchor = button.getBoundingClientRect();
    // The content's full height, not the box's: once a max-height has been set
    // the box is the clipped size, and measuring that would only ever shrink.
    const natural = (bubble.firstElementChild ?? bubble).scrollHeight + 2;
    const width = Math.min(BUBBLE_WIDTH, window.innerWidth - EDGE * 2);
    const centre = anchor.left + anchor.width / 2;
    const left = Math.min(Math.max(centre - width / 2, EDGE), window.innerWidth - width - EDGE);
    const roomBelow = window.innerHeight - EDGE - (anchor.bottom + GAP);
    const roomAbove = anchor.top - GAP - EDGE;
    const below = natural <= roomBelow || (natural > roomAbove && roomBelow >= roomAbove);
    const maxHeight = Math.max(120, below ? roomBelow : roomAbove);
    const height = Math.min(natural, maxHeight);
    setPlace({
      left,
      width,
      maxHeight,
      top: below ? anchor.bottom + GAP : anchor.top - GAP - height,
      side: below ? 'below' : 'above',
      tail: Math.min(Math.max(centre - left, 16), width - 16),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) position();
  }, [open, position]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (bubbleRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    // Follows the button when the page moves, rather than closing. It used to
    // close on any scroll, and tapping the button is itself enough to scroll
    // the page: the browser nudges a focused button near the edge into view,
    // so the bubble shut in the same moment it opened and never appeared.
    // Directly, not in an animation frame: scroll events already come at most
    // once a frame, and a frame never comes in a tab that is not being drawn.
    const follow = () => position();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
    };
  }, [open, position]);

  if (meters.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`photo-check__button${flagged ? ' is-flagged' : ''}`}
        aria-expanded={open}
        aria-controls={open ? bubbleId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="photo-check__dot" aria-hidden="true" />
        {t('photoCheck.title')}
        <span className="sr-only">{`: ${status}`}</span>
      </button>

      {open && createPortal(
        <div
          ref={bubbleRef}
          id={bubbleId}
          role="dialog"
          aria-label={t('photoCheck.title')}
          className={`photo-check__bubble is-${place?.side ?? 'below'}`}
          style={{
            left: place?.left ?? 0,
            top: place?.top ?? 0,
            width: place?.width ?? BUBBLE_WIDTH,
            visibility: place ? 'visible' : 'hidden',
            '--tail': `${place?.tail ?? BUBBLE_WIDTH / 2}px`,
          }}
        >
          <div className="photo-check__scroll" style={{ maxHeight: place?.maxHeight }}>
            <div className="photo-check__head">
              <span>{t('photoCheck.title')}</span>
              <span className={`photo-check__pill${flagged ? ' is-flagged' : ''}`}>{status}</span>
            </div>

            <ul className="photo-check__list">
              {meters.map((meter) => (
                <li key={meter.key} className={`photo-check__row is-${meter.zone}`}>
                  <span className="photo-check__label">{t(`photoCheck.${meter.key}`)}</span>
                  <span className="photo-check__verdict">{t(`photoCheck.zone.${meter.zone}`)}</span>
                  <span
                    className="photo-check__bar"
                    role="img"
                    aria-label={`${t(`photoCheck.${meter.key}`)}: ${t(`photoCheck.zone.${meter.zone}`)}`}
                  >
                    <span className="photo-check__fill" style={{ width: pct(barLength(meter)) }} />
                  </span>
                </li>
              ))}
            </ul>

            <p className="photo-check__note">{t('photoCheck.note')}</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/*
 * How long to draw the bar. Each measure's own scale put its warn line
 * anywhere -- 5% of the way along for printed text, 70% for glare -- so a
 * "Good" could be a quarter-full bar next to a "Fair" that was nearly full.
 * Rescaled so the length always agrees with the word: too low fills up to a
 * fifth, fair a fifth to a half, good from half to full. Never quite empty,
 * so a very low score is still visibly a bar.
 */
const BLOCK_END = 0.2;
const WARN_END = 0.5;

function barLength({ position, warnAt, blockAt }) {
  const block = blockAt ?? 0;
  let length;
  if (position >= warnAt) {
    length = WARN_END + (1 - WARN_END) * ((position - warnAt) / Math.max(1 - warnAt, 1e-9));
  } else if (position >= block) {
    length = BLOCK_END + (WARN_END - BLOCK_END) * ((position - block) / Math.max(warnAt - block, 1e-9));
  } else {
    length = BLOCK_END * (position / Math.max(block, 1e-9));
  }
  return Math.min(1, Math.max(0.05, length));
}

function pct(fraction) {
  return `${Math.round(Math.max(0, fraction) * 1000) / 10}%`;
}
