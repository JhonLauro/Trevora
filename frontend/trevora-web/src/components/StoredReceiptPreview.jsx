import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
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
  }, [count]);

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
          onClick={(event) => { if (event.target === event.currentTarget) setZoomed(false); }}
        >
          <div className="rcpt-full__bar">
            <span className="rcpt-full__title">
              {count > 1 ? `Page ${index + 1} of ${count}` : 'Receipt'}
            </span>
            <button
              className="rcpt-full__close"
              type="button"
              ref={closeRef}
              aria-label="Close"
              onClick={() => setZoomed(false)}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <img
            className="rcpt-full__image"
            src={current.url}
            alt={`Receipt page ${current.pageNumber}, full size`}
          />

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
