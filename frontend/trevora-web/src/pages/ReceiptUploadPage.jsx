import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';
import { createReceiptServiceDraft } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

export default function ReceiptUploadPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [receiptImage, setReceiptImage] = useState(null);
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

  function handleFileChange(event) {
    setReceiptImage(event.target.files?.[0] ?? null);
    setError('');
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
              <p>Use a clear photo so the mocked OCR can create a structured draft.</p>
            </div>
            <span className="method-badge">Mock OCR</span>
          </div>

          <label className="upload-zone">
            <input type="file" accept="image/*" onChange={handleFileChange} />
            <span className="upload-icon">U</span>
            <strong>Drop receipt here or click to upload</strong>
            <small>PNG, JPG, HEIC, or PDF-style image for the MVP demo.</small>
          </label>

          {receiptImage && (
            <div className="upload-summary">
              <div>
                <h2>Selected file</h2>
                <p>{receiptImage.name}</p>
                <p className="muted">{Math.round(receiptImage.size / 1024)} KB</p>
              </div>
              {previewUrl && <img src={previewUrl} alt="Selected receipt preview" />}
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
                <span>Raw text is mocked from the uploaded image.</span>
              </li>
              <li>
                <strong>Fields are mapped</strong>
                <span>Service date, type, shop, cost, and details are drafted.</span>
              </li>
              <li>
                <strong>Confidence is stored</strong>
                <span>Metadata shows source and mocked confidence values.</span>
              </li>
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}
