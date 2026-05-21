import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';
import { createReceiptServiceDraft } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

export default function ReceiptUploadPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [vehicle, setVehicle] = useState(null);
  const [receiptImage, setReceiptImage] = useState(null);
  const [draggingReceipt, setDraggingReceipt] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const previewUrl = useMemo(() => {
    if (!receiptImage || !receiptImage.type.startsWith('image/')) {
      return null;
    }
    return URL.createObjectURL(receiptImage);
  }, [receiptImage]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    function preventBrowserFileOpen(event) {
      event.preventDefault();
    }

    window.addEventListener('dragover', preventBrowserFileOpen);
    window.addEventListener('drop', preventBrowserFileOpen);

    return () => {
      window.removeEventListener('dragover', preventBrowserFileOpen);
      window.removeEventListener('drop', preventBrowserFileOpen);
    };
  }, []);

  useEffect(() => {
    let active = true;

    getVehicle(vehicleId)
      .then((data) => {
        if (active) {
          setVehicle(data);
          setError('');
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [vehicleId]);

  function setSelectedReceipt(file) {
    setReceiptImage(file);
    setError('');
  }

  function handleFileChange(event) {
    setSelectedReceipt(event.target.files?.[0] ?? null);
  }

  function handleUploadZoneClick() {
    fileInputRef.current?.click();
  }

  function handleUploadZoneKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleUploadZoneClick();
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingReceipt(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDraggingReceipt(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingReceipt(false);

    const droppedFile = Array.from(event.dataTransfer.files).find(isSupportedReceiptFile);
    if (!droppedFile) {
      setError('Drop a supported receipt image file.');
      return;
    }

    setSelectedReceipt(droppedFile);
  }

  function openPreview(event) {
    event.stopPropagation();
    setPreviewOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!receiptImage) {
      setError('Choose a receipt image before creating a draft.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const draft = await createReceiptServiceDraft({ vehicleId, receiptImage });
      navigate(`/service-drafts/${draft.draftId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="eyebrow">
          <Link className="inline-link" to="/vehicles">
            Change method
          </Link>
          <span>Receipt</span>
        </p>
        <h1>Add Service Record</h1>
        {loading ? (
          <p>Loading selected vehicle...</p>
        ) : vehicle ? (
          <p>
            Drafting for {vehicle.nickname || `${vehicle.make} ${vehicle.model}`}
            {vehicle.plateNumber ? ` - ${vehicle.plateNumber}` : ''}
          </p>
        ) : null}
      </section>

      <StepIndicator currentStep={3} />

      {error && <div className="alert">{error}</div>}

      <section className="content-two">
        <form className="panel record-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <div>
              <h2>Upload your receipt</h2>
              <p>Use a clear photo so OCR and AI extraction can create a structured draft.</p>
            </div>
            <span className="method-badge">OCR + AI</span>
          </div>

          <div
            className={`upload-zone ${receiptImage ? 'has-file' : ''} ${draggingReceipt ? 'is-dragging' : ''}`}
            onClick={handleUploadZoneClick}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onKeyDown={handleUploadZoneKeyDown}
            role="button"
            tabIndex={0}
          >
            <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" onChange={handleFileChange} />
            {receiptImage ? (
              <div className="upload-preview">
                {previewUrl ? (
                  <button className="upload-preview-button" type="button" onClick={openPreview}>
                    <img src={previewUrl} alt="Selected receipt preview" />
                  </button>
                ) : (
                  <span className="upload-icon">U</span>
                )}
                <div className="upload-preview-meta">
                  <strong>{receiptImage.name}</strong>
                  <small>{Math.round(receiptImage.size / 1024)} KB · Click or drag to replace</small>
                  {previewUrl && <span>Click the preview to open full size</span>}
                </div>
              </div>
            ) : (
              <>
                <span className="upload-icon">U</span>
                <strong>Drop receipt here or click to upload</strong>
                <small>PNG, JPG, HEIC, or PDF-style receipt image.</small>
              </>
            )}
          </div>

          {previewOpen && previewUrl && (
            <div className="image-preview-overlay" role="dialog" aria-modal="true" aria-label="Receipt image preview">
              <button
                className="image-preview-close"
                type="button"
                aria-label="Close receipt preview"
                onClick={() => setPreviewOpen(false)}
              >
                ×
              </button>
              <img src={previewUrl} alt="Full-size selected receipt preview" />
            </div>
          )}

          <div className="actions">
            <Link className="secondary-link" to={`/service-input/${vehicleId}`}>
              Change method
            </Link>
            <button type="submit" disabled={saving || loading}>
              {saving ? 'Creating draft...' : 'Create receipt draft'}
            </button>
          </div>
        </form>

        <aside className="guidance-stack">
          <section className="helper-card">
            <h2>What happens next</h2>
            <ul className="feature-list">
              <li>
                <strong>OCR reads your receipt</strong>
                <span>Tesseract extracts raw text from the uploaded image.</span>
              </li>
              <li>
                <strong>AI maps the fields</strong>
                <span>OpenAI returns structured draft values from the OCR text.</span>
              </li>
              <li>
                <strong>You still review</strong>
                <span>The draft is reviewed before any final record is saved.</span>
              </li>
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}

function isSupportedReceiptFile(file) {
  if (!file) return false;
  if (file.type.startsWith('image/')) return true;
  return /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name);
}
