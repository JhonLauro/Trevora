import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, X } from 'lucide-react';
import { createReceiptSignedUrl } from '../api/receiptStorage';

/**
 * The stored receipt for a confirmed record, and the full-size view of it.
 *
 * <p>Rewritten from the pre-Ink version. What it did before: laid every page
 * out in a grid of buttons that each sized themselves to their own image, so
 * a card holding a tall phone photo and a wide flatbed scan had two different
 * shaped tiles and a height that changed as the images arrived. And the
 * full-size view was a bare overlay with a lowercase letter "x" for a close
 * button and no way to reach page two.
 *
 * <p>Now: one page at a time in a frame of fixed proportions, so the card is
 * the same height before and after the image loads and whatever shape the
 * paper is. Pages are stepped through rather than tiled. The full-size view
 * has the same controls, plus the keyboard.
 */

/* 3:4 — taller than wide, because a receipt is. A page that does not match it
   is contained rather than cropped: the whole point of keeping the image is
   being able to check a figure against it, and a crop can hide the total. */
export default function StoredReceiptPreview({ source, title = 'Saved receipt' }) {
  const pages = useMemo(() => storedReceiptPages(source), [source]);
  const [signed, setSigned] = useState([]);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState({});
  const [zoomed, setZoomed] = useState(false);
  const closeRef = useRef(null);
  const openerRef = useRef(null);

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
  const MIN_SCALE = 1;
  const MAX_SCALE = 5;
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const pinchRef = useRef(null);

  /* Back to fitted. Called on open, on close, and whenever the page changes --
     page two at 4x, panned to where page one's total was, is disorienting. */
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
    setScale((current) => {
      const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
      if (target === current) return current;
      const ratio = target / current;
      setOffset((o) => (target === MIN_SCALE
        ? { x: 0, y: 0 }
        : { x: pointX - (pointX - o.x) * ratio, y: pointY - (pointY - o.y) * ratio }));
      return target;
    });
  }, []);

  useEffect(() => {
    let active = true;
    setSigned([]);
    setError('');
    setLoaded({});
    setIndex(0);

    if (pages.length === 0) return () => { active = false; };

    Promise.all(pages.map((page) => (
      createReceiptSignedUrl({
        receiptStorageBucket: page.bucket,
        receiptStoragePath: page.path,
      }).then((url) => ({ ...page, url }))
    )))
      .then((withUrls) => {
        if (active) setSigned(withUrls.filter((page) => page.url));
      })
      .catch((err) => {
        if (active) setError(err.message);
      });

    return () => { active = false; };
  }, [pages]);

  const count = signed.length;
  const current = signed[index];

  const step = useCallback((delta) => {
    if (count < 2) return;
    // Wraps. With two or three pages, a disabled arrow at each end is more
    // fiddling than it saves.
    setIndex((now) => (now + delta + count) % count);
    /* A new page opens fitted. Arriving at page two already at 4x, panned to
       where page one's total happened to be, shows a corner of nothing. */
    resetZoom();
  }, [count, resetZoom]);

  /* Escape closes, arrows page. Only while the full-size view is open — the
     card itself must not swallow arrow keys from the page around it. */
  useEffect(() => {
    if (!zoomed) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape') setZoomed(false);
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomed, step]);

  /* Focus goes to the close button on open and back to the thumbnail on
     close, so a keyboard user is never left on a control that has gone. */
  useEffect(() => {
    if (zoomed) closeRef.current?.focus();
    else openerRef.current?.focus({ preventScroll: true });
  }, [zoomed]);

  if (pages.length === 0) return null;

  const pager = count > 1 && (
    <div className="rcpt__pager">
      <button className="rcpt__step" type="button" aria-label="Previous page" onClick={() => step(-1)}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span className="rcpt__count" aria-live="polite">Page {index + 1} of {count}</span>
      <button className="rcpt__step" type="button" aria-label="Next page" onClick={() => step(1)}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <>
      <div className="rcpt">
        <p className="rcpt__caption">
          {count > 1
            ? `${count} pages`
            : (source.receiptOriginalFilename || 'The receipt this record came from')}
        </p>

        {current ? (
          <>
            <button
              className="rcpt__frame"
              type="button"
              ref={openerRef}
              onClick={() => setZoomed(true)}
              aria-label={`Open page ${current.pageNumber} full size`}
            >
              {!loaded[current.path] && <span className="rcpt__loading">Loading…</span>}
              <img
                src={current.url}
                alt={`Receipt page ${current.pageNumber}`}
                onLoad={() => setLoaded((now) => ({ ...now, [current.path]: true }))}
                onError={() => setError('That page could not be loaded.')}
              />
              <span className="rcpt__zoom" aria-hidden="true">
                <Maximize2 size={15} />
              </span>
            </button>
            {pager}
          </>
        ) : (
          /* Same proportions while empty, so the card does not jump when the
             image arrives or when it fails. */
          <div className="rcpt__frame rcpt__frame--empty">
            <span className="rcpt__loading">{error || 'Loading the receipt…'}</span>
          </div>
        )}

        {error && current && <p className="rcpt__error">{error}</p>}
      </div>

      {zoomed && current && (
        <div
          className="rcpt-full"
          role="dialog"
          aria-modal="true"
          aria-label={`Receipt page ${current.pageNumber} of ${count}`}
          /* Backdrop only: a click that started inside the image must not
              close it, which is what happens when the handler sits on the
              container and does not check its target. */
          onClick={(event) => {
            if (event.target === event.currentTarget) { setZoomed(false); resetZoom(); }
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
              onClick={() => { setZoomed(false); resetZoom(); }}
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
              /* One gesture, both directions: magnified goes back to fitted,
                 fitted jumps to something worth reading rather than nudging. */
              zoomAbout(
                scale > MIN_SCALE ? MIN_SCALE : 2.5,
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
      )}
    </>
  );
}

function storedReceiptPages(source) {
  const pages = source?.fieldMetadata?.storedReceiptPages;
  if (Array.isArray(pages) && pages.length > 0) {
    return pages
      .filter((page) => page?.path)
      .map((page, index) => ({
        pageNumber: page.pageNumber ?? index + 1,
        bucket: page.bucket || source.receiptStorageBucket,
        path: page.path,
        originalFilename: page.originalFilename,
        contentType: page.contentType,
      }));
  }

  if (!source?.receiptStoragePath) return [];

  return [{
    pageNumber: 1,
    bucket: source.receiptStorageBucket,
    path: source.receiptStoragePath,
    originalFilename: source.receiptOriginalFilename,
    contentType: source.receiptContentType,
  }];
}
