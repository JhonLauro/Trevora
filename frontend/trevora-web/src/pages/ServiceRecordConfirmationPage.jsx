import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { confirmServiceDraft, getServiceDraftReview } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

const summaryFields = [
  ['serviceDate', 'Service date'],
  ['serviceType', 'Service type'],
  ['totalCost', 'Total cost'],
  ['shopName', 'Shop / mechanic'],
  ['partsReplaced', 'Parts'],
  ['laborPerformed', 'Labor / work performed'],
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

function issueMapFor(validation) {
  const issueMap = new Map();
  for (const issue of validation?.flaggedFields ?? []) issueMap.set(issue.fieldName, issue);
  for (const issue of validation?.missingRequiredFields ?? []) issueMap.set(issue.fieldName, issue);
  return issueMap;
}

function confidenceLabel(issue, value) {
  if (!issue && value !== null && value !== undefined && value !== '') return 'Reviewed';
  if (!issue) return 'Optional';
  if (issue.blocksConfirmation) return 'Required';
  if (issue.category === 'SOURCE_FIELD' && issue.confidence !== null && issue.confidence !== undefined) {
    const confidence = Number(issue.confidence);
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.75) return 'Medium';
    return 'Low';
  }
  if (issue.category === 'LOW_CONFIDENCE') return 'Low';
  if (issue.category === 'NOT_FOUND') return 'Not found';
  return 'Reviewed';
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

  const issueMap = useMemo(() => issueMapFor(validation), [validation]);
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
          <Link className="inline-link" to={`/service-drafts/${draftId}/correct`}>
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
              Complete required fields before confirmation. Vehicle, service date, service type, and total cost are required.
            </div>
          )}

          <section className="confirmation-card">
            <div className="confirmation-header">
              <div>
                <h2>Final record summary</h2>
                <p>Will be saved to {vehicleName(vehicle, draft)} service records.</p>
              </div>
              <span className="badge">{draft.inputMethod}</span>
            </div>

            <dl className="confirmation-list">
              <div>
                <dt>Vehicle</dt>
                <dd>
                  <strong>{vehicleName(vehicle, draft)}</strong>
                  <span className="field-confidence-badge field-confidence-high">Reviewed</span>
                </dd>
              </div>
              {summaryFields.map(([key, label]) => {
                const issue = issueMap.get(key);
                const value = draft[key];
                const confidence = confidenceLabel(issue, value);
                return (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      <strong>{displayValue(key, value)}</strong>
                      <span className={issue?.blocksConfirmation ? 'field-confidence-badge field-confidence-low' : 'field-confidence-badge field-confidence-high'}>
                        {confidence}
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <label className="confirmation-check">
            <input checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} type="checkbox" />
            <span>I confirm the details above are correct and authorize this record to be added to my vehicle service records.</span>
          </label>

          <div className="confirmation-actions">
            <Link className="button-secondary button-link-secondary" to={`/service-drafts/${draftId}/correct`}>
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
