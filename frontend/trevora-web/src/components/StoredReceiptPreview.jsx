import React, { useEffect, useState } from 'react';
import { createReceiptSignedUrl } from '../api/receiptStorage';

export default function StoredReceiptPreview({ source, title = 'Saved receipt' }) {
  const [receiptPages, setReceiptPages] = useState([]);
  const [receiptError, setReceiptError] = useState('');
  const [previewPage, setPreviewPage] = useState(null);
  const [loadedPages, setLoadedPages] = useState({});

  useEffect(() => {
    let active = true;
    setReceiptPages([]);
    setReceiptError('');
    setLoadedPages({});

    const storedPages = storedReceiptPages(source);
    if (storedPages.length === 0) {
      return () => {
        active = false;
      };
    }

    Promise.all(
      storedPages.map((page) => (
        createReceiptSignedUrl({
          receiptStorageBucket: page.bucket,
          receiptStoragePath: page.path,
        }).then((url) => ({ ...page, url }))
      )),
    )
      .then((pages) => {
        if (active) setReceiptPages(pages.filter((page) => page.url));
      })
      .catch((error) => {
        if (active) setReceiptError(error.message);
      });

    return () => {
      active = false;
    };
  }, [source]);

  if (storedReceiptPages(source).length === 0) {
    return null;
  }

  return (
    <>
      <section className="stored-receipt-card">
        <h2>{title}</h2>
        <p>{receiptPages.length > 1 ? `${receiptPages.length} receipt pages` : source.receiptOriginalFilename || 'Original uploaded receipt'}</p>
        {receiptPages.length > 0 ? (
          <div className="stored-receipt-page-grid">
            {receiptPages.map((page) => (
              <button className="stored-receipt-preview-button" type="button" onClick={() => setPreviewPage(page)} key={page.path}>
                <span className="stored-receipt-image-wrap">
                  {!loadedPages[page.path] && <span className="stored-receipt-loading">Loading preview...</span>}
                  <img
                    src={page.url}
                    alt={`Uploaded receipt page ${page.pageNumber}`}
                    onLoad={() => setLoadedPages((current) => ({ ...current, [page.path]: true }))}
                    onError={() => setReceiptError('One receipt preview could not load.')}
                  />
                </span>
                <span className="stored-receipt-action-label">Page {page.pageNumber}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="stored-receipt-empty">
            {receiptError || 'Loading receipt image...'}
          </div>
        )}
      </section>

      {previewPage && (
        <div className="image-preview-overlay" role="dialog" aria-modal="true" aria-label="Stored receipt preview">
          <button
            className="image-preview-close"
            type="button"
            aria-label="Close receipt preview"
            onClick={() => setPreviewPage(null)}
          >
            x
          </button>
          <img src={previewPage.url} alt={`Full-size uploaded receipt page ${previewPage.pageNumber}`} />
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

  if (!source?.receiptStoragePath) {
    return [];
  }

  return [{
    pageNumber: 1,
    bucket: source.receiptStorageBucket,
    path: source.receiptStoragePath,
    originalFilename: source.receiptOriginalFilename,
    contentType: source.receiptContentType,
  }];
}
