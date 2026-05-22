import React, { useEffect, useState } from 'react';
import { createReceiptSignedUrl } from '../api/receiptStorage';

export default function StoredReceiptPreview({ source, title = 'Saved receipt' }) {
  const [receiptUrl, setReceiptUrl] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setReceiptUrl('');
    setReceiptError('');
    setThumbnailLoaded(false);

    if (!source?.receiptStoragePath) {
      return () => {
        active = false;
      };
    }

    createReceiptSignedUrl(source)
      .then((url) => {
        if (active) setReceiptUrl(url);
      })
      .catch((error) => {
        if (active) setReceiptError(error.message);
      });

    return () => {
      active = false;
    };
  }, [source]);

  if (!source?.receiptStoragePath) {
    return null;
  }

  return (
    <>
      <section className="stored-receipt-card">
        <h2>{title}</h2>
        <p>{source.receiptOriginalFilename || 'Original uploaded receipt'}</p>
        {receiptUrl ? (
          <button className="stored-receipt-preview-button" type="button" onClick={() => setPreviewOpen(true)}>
            <span className="stored-receipt-image-wrap">
              {!thumbnailLoaded && <span className="stored-receipt-loading">Loading preview...</span>}
              <img
                src={receiptUrl}
                alt="Uploaded receipt preview"
                onLoad={() => setThumbnailLoaded(true)}
                onError={() => setReceiptError('Preview could not load. Click to open the saved receipt.')}
              />
            </span>
            <span className="stored-receipt-action-label">View receipt</span>
          </button>
        ) : (
          <div className="stored-receipt-empty">
            {receiptError || 'Loading receipt image...'}
          </div>
        )}
      </section>

      {previewOpen && receiptUrl && (
        <div className="image-preview-overlay" role="dialog" aria-modal="true" aria-label="Stored receipt preview">
          <button
            className="image-preview-close"
            type="button"
            aria-label="Close receipt preview"
            onClick={() => setPreviewOpen(false)}
          >
            ×
          </button>
          <img src={receiptUrl} alt="Full-size uploaded receipt" />
        </div>
      )}
    </>
  );
}
