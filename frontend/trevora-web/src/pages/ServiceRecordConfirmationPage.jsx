import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StoredReceiptPreview from '../components/StoredReceiptPreview';
import ServiceItemsList from '../components/ServiceItemsList';
import { confirmServiceDraft, getServiceDraftReview } from '../api/serviceDrafts';
import { fieldSignal, issuesByField } from '../utils/fieldConfidence';
import { getVehicle } from '../api/vehicles';

const summaryFields = [
  ['serviceDate', 'Service date'],
  ['totalCost', 'Total cost'],
  ['shopName', 'Shop Name'],
  ['odometer', 'Odometer'],
  ['location', 'Location'],
  ['remarks', 'Remarks'],
];

function displayValue(key, value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (key === 'totalCost') return `PHP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (key === 'odometer') return `${Number(value).toLocaleString()} km`;
  return String(value);
}

function vehicleName(vehicle, draft) {
  if (!vehicle) return draft?.vehicleId ?? 'Selected vehicle';
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}



export default function ServiceRecordConfirmationPage() {
  const { draftId } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [validation, setValidation] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getServiceDraftReview(draftId)
      .then(async (data) => {
        if (active) {
          setDraft(data.draft);
          setValidation(data.validation);
          setError('');
        }
        try {
          const vehicleData = await getVehicle(data.draft.vehicleId);
          if (active) setVehicle(vehicleData);
        } catch {
          if (active) setVehicle(null);
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
  }, [draftId]);

  const issueMap = useMemo(() => issuesByField(validation), [validation]);
  const canSave = validation?.valid && authorized && !saving;

  async function handleConfirm() {
    setSaving(true);
    setError('');
    try {
      const result = await confirmServiceDraft(draftId);
      navigate(`/service-drafts/${draftId}/saved`, { state: result });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell module-two-page">
      <section className="page-header">
        <p className="eyebrow">
          <Link className="inline-link" to={`/service-drafts/${draftId}`}>
            Back to edit
          </Link>
          <span>{draft?.inputMethod ?? 'Draft'}</span>
        </p>
        <h1>Confirm Service Record</h1>
        <p>Review the final read-only summary before saving this validated record.</p>
      </section>

      {loading && <p className="muted">Loading final summary...</p>}
      {error && <div className="alert">{error}</div>}

      {draft && (
        <section className="confirmation-shell">
          {!validation?.valid && (
            <div className="alert">
              Some fields still need attention. Go back to edit to finish them.
            </div>
          )}

          <section className="confirmation-card">
            <div className="confirmation-header">
              <div>
                <h2>Summary</h2>
                <p>Will be saved to {vehicleName(vehicle, draft)} service records.</p>
              </div>
              <span className="badge">{draft.inputMethod}</span>
            </div>

            <div className="confirmation-services-section">
              <h3>Services</h3>
              <ServiceItemsList services={draft.services} />
            </div>

            <dl className="confirmation-list">
              <div>
                <dt>Vehicle</dt>
                <dd>
                  <strong>{vehicleName(vehicle, draft)}</strong>
                </dd>
              </div>
              {summaryFields.map(([key, label]) => {
                const value = draft[key];
                // The same vocabulary as the review screen. A badge that
                // changes wording between the screen where you check a value
                // and the screen where you commit it is a badge nobody can
                // learn to read.
                const { status, label: badgeText } = fieldSignal({
                  draft, fieldName: key, value, issue: issueMap.get(key),
                });
                return (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      <strong>{displayValue(key, value)}</strong>
                      {badgeText && (
                        <span className={`field-confidence-badge field-confidence-${status ?? 'high'}`}>
                          {badgeText}
                        </span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          {draft.receiptStoragePath && (
            <section className="confirmation-card">
              <StoredReceiptPreview source={draft} title="Stored receipt" />
            </section>
          )}

          <label className="confirmation-check">
            <input checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} type="checkbox" />
            <span>I confirm the details above are correct and authorize this record to be added to my vehicle service records.</span>
          </label>

          <div className="confirmation-actions">
            <Link className="button-secondary button-link-secondary" to={`/service-drafts/${draftId}`}>
              Back to Edit
            </Link>
            <button type="button" disabled={!canSave} onClick={handleConfirm}>
              {saving ? 'Saving...' : 'Confirm and Save Record'}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
