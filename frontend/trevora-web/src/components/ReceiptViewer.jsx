import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';

/**
 * A receipt page full screen, with zoom.
 *
 * <p>Lifted out of StoredReceiptPreview so the add-record flow gets the same
 * viewer. Checking a draft is exactly when a line item has to be read off a
 * phone photograph -- a total to compare, a part number to confirm -- and the
 * flow's own preview could only show the page fitted to the screen. Saved
 * records, the mechanic view and the draft steps now open one viewer, so a
 * gesture learnt on one works on all of them.
 *
 * <p>Mounted only while open: Escape, the arrow keys and the zoom level all
 * belong to the moment it is on screen, and unmounting is what resets them.
 *
 * @param pages          signed pages, each `{ pageNumber, path, url }`
 * @param index          the page showing
 * @param onIndexChange  called with an updater, the way a useState setter is
 * @param onClose        closes the viewer
 */
const MIN_SCALE = 1;
/* 800%. Five times was not far enough to read a faded line or a part number
   off a phone photograph once it had been fitted to a laptop screen. Past
   roughly 300% an uploaded receipt (resized to 2000px on its long edge before
   upload) gets bigger rather than sharper, but bigger is still what makes a
   smudged digit legible. */
const MAX_SCALE = 8;

/* Where each double-click lands, starting from fitted: a readable 250%, then
   500%, then all the way in. One more goes back to fitted, so a single gesture
   walks in and resets rather than only toggling between two levels. */
const DOUBLE_CLICK_LEVELS = [2.5, 5, MAX_SCALE];

export default function ReceiptViewer({ pages, index, onIndexChange, onClose }) {
  const count = pages.length;
  const current = pages[index];
  const closeRef = useRef(null);

  /*
   * Magnification inside the full-size view.
   *
   * <p>Fitting the page to the screen is the right way to open -- it answers
   * "which receipt is this" at a glance -- but it is not enough to read a
   * line item off a phone photograph, which is the reason the image was kept
   * at all. So the fitted view is the starting point, not the only one.
   *
   * <p>`scale` is a multiplier on that fitted size and `offset` moves the
   * image under a fixed frame. Panning is stored in pixels rather than
   * percentages because a drag is measured in pixels; converting twice only
   * introduces rounding the eye can see.
   */
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const pinchRef = useRef(null);

  /* Back to fitted whenever the page changes -- page two at 4x, panned to
     where page one's total was, is disorienting. */
  const resetZoom = useCallback(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }, []);

  /*
   * Zoom about a point rather than the centre.
   *
   * <p>Zooming about the centre means the thing being examined slides away as
   * it grows, and it is examined precisely because it is not in the middle.
   * Keeping the point under the cursor fixed is what makes the wheel and pinch
   * feel like magnifying the paper instead of moving it.
   */
  const zoomAbout = useCallback((nextScale, pointX, pointY) => {
    setScale((now) => {
      const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
      if (target === now) return now;
      const ratio = target / now;
      setOffset((o) => (target === MIN_SCALE
        ? { x: 0, y: 0 }
        : { x: pointX - (pointX - o.x) * ratio, y: pointY - (pointY - o.y) * ratio }));
      return target;
    });
  }, []);

  const step = useCallback((delta) => {
    if (count < 2) return;
    // Wraps. With two or three pages, a disabled arrow at each end is more
    // fiddling than it saves.
    onIndexChange((now) => (now + delta + count) % count);
    /* A new page opens fitted. Arriving at page two already at 4x, panned to
       where page one's total happened to be, shows a corner of nothing. */
    resetZoom();
  }, [count, onIndexChange, resetZoom]);

  /* Escape closes, arrows page. Registered on mount, so only while the viewer
     is on screen -- the page underneath keeps its arrow keys the rest of the
     time. */
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, step]);

  /* Focus lands on the close button when the viewer opens, so a keyboard user
     starts inside it. Handing focus back on close is the opener's job: only it
     knows what was pressed to get here. */
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  if (!current) return null;

  return (
    <div
      className="rcpt-full"
      role="dialog"
      aria-modal="true"
      aria-label={`Receipt page ${current.pageNumber} of ${count}`}
      /* Backdrop only: a click that started inside the image must not
          close it, which is what happens when the handler sits on the
          container and does not check its target. */
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="rcpt-full__bar">
        <span className="rcpt-full__title">
          {count > 1 ? `Page ${index + 1} of ${count}` : 'Receipt'}
        </span>
        {/* Wheel, pinch and double-click all work, and none of them
            announce themselves. Buttons are how somebody finds out the
            view zooms at all -- and the only way in with a keyboard. */}
        <div className="rcpt-full__zoomers">
          <button
            className="rcpt-full__close"
            type="button"
            aria-label="Zoom out"
            disabled={scale <= MIN_SCALE}
            onClick={() => zoomAbout(scale / 1.4, 0, 0)}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <span className="rcpt-full__level" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button
            className="rcpt-full__close"
            type="button"
            aria-label="Zoom in"
            disabled={scale >= MAX_SCALE}
            onClick={() => zoomAbout(scale * 1.4, 0, 0)}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
        <button
          className="rcpt-full__close"
          type="button"
          ref={closeRef}
          aria-label="Close"
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      {/* The frame is fixed and the image moves inside it, so panning
          never drags the picture out over the toolbar or the arrows. */}
      <div
        className="rcpt-full__stage"
        onWheel={(event) => {
          /* Ctrl+wheel is the browser's own page zoom on some setups, so
             plain wheel is used here and the event is claimed either way --
             a wheel over a magnified receipt means this image, not the
             page behind the overlay. */
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          zoomAbout(
            scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15),
            event.clientX - rect.left - rect.width / 2,
            event.clientY - rect.top - rect.height / 2,
          );
        }}
        onDoubleClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          /* Steps in rather than nudging: the next level above wherever the
             view is now, and back to fitted once it is all the way in. A view
             zoomed by wheel or pinch to, say, 320% goes on to 500%. */
          const nextLevel = DOUBLE_CLICK_LEVELS.find((level) => level > scale + 0.01);
          zoomAbout(
            nextLevel ?? MIN_SCALE,
            event.clientX - rect.left - rect.width / 2,
            event.clientY - rect.top - rect.height / 2,
          );
        }}
        onPointerDown={(event) => {
          if (scale === MIN_SCALE) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            id: event.pointerId,
            startX: event.clientX - offset.x,
            startY: event.clientY - offset.y,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.id !== event.pointerId) return;
          setOffset({ x: event.clientX - drag.startX, y: event.clientY - drag.startY });
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
        onTouchStart={(event) => {
          if (event.touches.length !== 2) return;
          const [a, b] = event.touches;
          pinchRef.current = {
            distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
            scale,
          };
        }}
        onTouchMove={(event) => {
          const pinch = pinchRef.current;
          if (!pinch || event.touches.length !== 2) return;
          event.preventDefault();
          const [a, b] = event.touches;
          const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          const rect = event.currentTarget.getBoundingClientRect();
          zoomAbout(
            pinch.scale * (distance / pinch.distance),
            (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2,
            (a.clientY + b.clientY) / 2 - rect.top - rect.height / 2,
          );
        }}
        onTouchEnd={() => { pinchRef.current = null; }}
      >
        <img
          className="rcpt-full__image"
          src={current.url}
          alt={`Receipt page ${current.pageNumber}, full size`}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            cursor: scale > MIN_SCALE ? (dragRef.current ? 'grabbing' : 'grab') : 'zoom-in',
          }}
        />
      </div>

      {count > 1 && (
        <>
          <button
            className="rcpt-full__step rcpt-full__step--prev"
            type="button"
            aria-label="Previous page"
            onClick={() => step(-1)}
          >
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
          <button
            className="rcpt-full__step rcpt-full__step--next"
            type="button"
            aria-label="Next page"
            onClick={() => step(1)}
          >
            <ChevronRight size={24} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
