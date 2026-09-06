import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { createReceiptSignedUrl } from '../../api/receiptStorage';

/**
 * The receipt as a page strip above the fields, rather than as a column beside
 * them.
 *
 * <p>This is the move that lets one layout carry all three input methods. The
 * old receipt layout spent a whole column on the image, which left no room for
 * the status rail — so the rail was dropped, and with it every non-blocking
 * warning on the most common path. As a strip the receipt costs 132px of
 * height instead of half the width, and opens full size when it is actually
 * needed.
 */

/** The stored pages for a draft, newest metadata shape first. */
export function storedReceiptPages(source) {
  const pages = source?.fieldMetadata?.storedReceiptPages;
  if (Array.isArray(pages) && pages.length > 0) {
    return pages
      .filter((page) => page?.path)
      .map((page, index) => ({
        pageNumber: page.pageNumber ?? index + 1,
        bucket: page.bucket || source.receiptStorageBucket,
        path: page.path,
      }));
  }
  if (!source?.receiptStoragePath) return [];
  return [{
    pageNumber: 1,
    bucket: source.receiptStorageBucket,
    path: source.receiptStoragePath,
  }];
}

export default function ReceiptStrip({ draft }) {
  const [pages, setPages] = useState([]);
  const [active, setActive] = useState(0);
  const [full, setFull] = useState(null);
  const [error, setError] = useState('');
  const [showText, setShowText] = useState(false);

  const stored = storedReceiptPages(draft);

  useEffect(() => {
    let live = true;
    setPages([]);
    setError('');
    if (stored.length === 0) return () => { live = false; };

    Promise.all(stored.map((page) => createReceiptSignedUrl({
      receiptStorageBucket: page.bucket,
      receiptStoragePath: page.path,
    }).then((url) => ({ ...page, url }))))
      .then((loaded) => { if (live) setPages(loaded.filter((page) => page.url)); })
      .catch((err) => { if (live) setError(err.message); });

    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.draftId, draft?.receiptStoragePath]);

  /* Escape closes the full-size view. Mounted only while it is open, so this
     never competes with anything else on the page for the key. */
  useEffect(() => {
    if (!full) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') setFull(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [full]);

  const rawText = draft?.fieldMetadata?.rawOcrText;
  const hasRawText = typeof rawText === 'string' && rawText.trim().length > 0;
  const count = stored.length;

  if (count === 0) return null;

  return (
    <section className="flow-card flow-source">
      <div className="flow-source__head">
        <span className="flow-eyebrow">
          The receipt · {count} page{count === 1 ? '' : 's'}
        </span>
        {pages[active] && (
          <button className="flow-link" type="button" onClick={() => setFull(pages[active])}>
            Open full size
          </button>
        )}
      </div>

      <div className="flow-source__pages">
        {(pages.length > 0 ? pages : stored).map((page, index) => (
          <button
            className={`flow-page${index === active ? ' is-active' : ''}`}
            type="button"
            key={page.path}
            onClick={() => { setActive(index); if (page.url) setFull(page); }}
            aria-label={`Receipt page ${page.pageNumber}`}
          >
            {page.url && <img src={page.url} alt="" />}
            <span className="flow-page__n">{page.pageNumber}</span>
          </button>
        ))}

        <div className="flow-source__aside">
          <p className="flow-note">
            Tap a page to see it full size. A quote under a field says which page it came from.
          </p>
          {hasRawText && (
            <button className="flow-link" type="button" onClick={() => setShowText((open) => !open)}>
              <ChevronRight
                size={16}
                aria-hidden="true"
                style={{ verticalAlign: '-2px', transform: showText ? 'rotate(90deg)' : 'none' }}
              />
              {' '}
              The words we read off it
            </button>
          )}
        </div>
      </div>

      {error && <p className="flow-note">{error}</p>}

      {showText && hasRawText && (
        <pre className="flow-quote" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{rawText}</pre>
      )}

      {full && (
        <div
          className="image-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Receipt page"
          /* Clicking away closes it, the way every image viewer people already
             use behaves. Guarded on the target so a click that lands on the
             photograph itself does not dismiss the thing it was aimed at --
             and a receipt is a document somebody is peering at, so a stray tap
             while reading must not throw it away. */
          onClick={(event) => { if (event.target === event.currentTarget) setFull(null); }}
        >
          <button
            className="image-preview-close"
            type="button"
            aria-label="Close receipt preview"
            onClick={() => setFull(null)}
          >
            ×
          </button>
          <img src={full.url} alt={`Receipt page ${full.pageNumber}`} />
        </div>
      )}
    </section>
  );
}
