import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getServiceDraftReview, updateServiceDraftCorrections } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';
import { formatServiceText } from '../utils/serviceText';

const correctionFields = [
  ['serviceDate', 'Service date', 'date', true],
  ['serviceType', 'Service type', 'text', false],
  ['totalCost', 'Total cost', 'number', true],
  ['odometer', 'Odometer at service', 'number', false],
  ['shopName', 'Shop Name', 'text', false],
  ['location', 'Shop location', 'text', false],
  ['partsReplaced', 'Parts replaced', 'textarea', false],
  ['laborPerformed', 'Labor / work performed', 'textarea', false],
  ['remarks', 'Remarks', 'textarea', false],
];

function draftToForm(draft) {
  return correctionFields.reduce((form, [key]) => {
    form[key] = ['partsReplaced', 'laborPerformed'].includes(key)
      ? formatServiceText(draft?.[key], '')
      : draft?.[key] ?? '';
    return form;
  }, {});
}

function issueMapFor(validation) {
  const issueMap = new Map();
  for (const issue of validation?.flaggedFields ?? []) {
    if (!isOptionalServiceTypeIssue(issue)) issueMap.set(issue.fieldName, issue);
  }
  for (const issue of validation?.missingRequiredFields ?? []) {
    if (!isOptionalServiceTypeIssue(issue)) issueMap.set(issue.fieldName, issue);
  }
  return issueMap;
}

function isOptionalServiceTypeIssue(issue) {
  return issue?.fieldName === 'serviceType'
    && (issue.blocksConfirmation || issue.category === 'MISSING_REQUIRED');
}

function isBlankOptionalFieldIssue(issue, form = {}) {
  if (isOptionalServiceTypeIssue(issue)) return true;
  return issue?.fieldName === 'odometer' && !String(form.odometer ?? issue.currentValue ?? '').trim();
}

function canProceedToConfirmation(validation) {
  return !(validation?.missingRequiredFields ?? []).some((issue) => !isOptionalServiceTypeIssue(issue));
}

function correctionSummary(validation, form = {}) {
  const missingRequiredCount = (validation?.missingRequiredFields ?? [])
    .filter((issue) => !isOptionalServiceTypeIssue(issue)).length;
  const reviewCount = (validation?.flaggedFields ?? [])
    .filter((issue) => !isBlankOptionalFieldIssue(issue, form) && issue.requiresReview).length;

  const parts = [
    missingRequiredCount
      ? `${missingRequiredCount} required field(s) must be completed before confirmation.`
      : 'All required fields are present.',
  ];

  if (reviewCount) {
    parts.push(`${reviewCount} extracted field(s) need owner review.`);
  } else {
    parts.push('No low-confidence extracted fields require review.');
  }

  return parts.join(' ');
}

function vehicleName(vehicle, draft) {
  if (!vehicle) return draft?.vehicleId ?? 'Selected vehicle';
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

function serializeCorrections(form) {
  return {
    serviceDate: form.serviceDate || null,
    serviceType: form.serviceType.trim() || null,
    odometer: form.odometer === '' ? null : Number(form.odometer),
    totalCost: form.totalCost === '' ? null : Number(form.totalCost),
    shopName: form.shopName.trim() || null,
    location: form.location.trim() || null,
    partsReplaced: form.partsReplaced.trim() || null,
    laborPerformed: form.laborPerformed.trim() || null,
    remarks: form.remarks.trim() || null,
  };
}

function badgeFor(issue) {
  if (!issue) return null;
  if (issue.blocksConfirmation) return 'Required';
  if (issue.category === 'SOURCE_FIELD') return issue.confidence ? `${Math.round(Number(issue.confidence) * 100)}%` : 'Source';
  if (issue.category === 'LOW_CONFIDENCE') return 'Low';
  if (issue.category === 'NOT_FOUND') return 'Not found';
  if (issue.category === 'MISSING_METADATA') return 'Missing';
  if (issue.category === 'UNCERTAIN') return 'Uncertain';
  return 'Review';
}

function fieldStatusFor(key, issue, form) {
  if (key === 'odometer' && !String(form.odometer ?? '').trim()) {
    return {
      className: 'status-not-found',
      label: 'Not found',
      hint: 'Optional: fill manually',
    };
  }

  if (issue?.blocksConfirmation || issue?.requiresReview) {
    return {
      className: 'status-needs-review',
      label: badgeFor(issue),
    };
  }

  if (key === 'serviceType' && !String(form.serviceType ?? '').trim()) {
    return {
      className: 'status-not-found',
      label: 'Not found',
    };
  }

  return {
    className: 'status-ok',
    label: badgeFor(issue) || 'OK',
  };
}

function hintFor(issue, draft) {
  if (issue?.message) return issue.message;
  if (draft?.inputMethod === 'MANUAL') return 'Owner-entered value.';
  if (draft?.inputMethod === 'RECEIPT') return 'Review the extracted receipt value before saving.';
  if (draft?.inputMethod === 'VOICE') return 'Review the value inferred from the voice draft.';
  return '';
}

export default function ServiceDraftCorrectionPage() {
  const { draftId } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [validation, setValidation] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;

    getServiceDraftReview(draftId)
      .then(async (data) => {
        if (active) {
          setDraft(data.draft);
          setValidation(data.validation);
          setForm(draftToForm(data.draft));
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
  const attentionCount = (validation?.missingRequiredFields?.filter((issue) => !isOptionalServiceTypeIssue(issue)).length ?? 0)
    + (validation?.flaggedFields?.filter((issue) => !isBlankOptionalFieldIssue(issue, form) && issue.requiresReview).length ?? 0);
  const readyForConfirmation = canProceedToConfirmation(validation);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSuccess('');
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await updateServiceDraftCorrections(draftId, serializeCorrections(form));
      setDraft(response.draft);
      setValidation(response.validation);
      setForm(draftToForm(response.draft));
      setSuccess(canProceedToConfirmation(response.validation)
        ? 'Corrections saved. This draft is ready to confirm.'
        : 'Corrections saved. Complete the remaining required fields.');
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
          <Link className="inline-link" to={`/service-drafts/${draftId}/review`}>
            Back to review
          </Link>
          <span>{draft?.inputMethod ?? 'Draft'}</span>
        </p>
        <h1>Correct Service Details</h1>
        <p>Update flagged or incomplete fields, then save corrections before confirmation.</p>
      </section>

      {loading && <p className="muted">Loading correction form...</p>}
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert success-alert">{success}</div>}

      {draft && (
        <section className="correction-layout">
          <aside className="correction-sidebar">
            <section className={attentionCount ? 'helper-card warning' : 'helper-card success'}>
              <h2>{attentionCount ? `${attentionCount} field(s) need attention` : 'No blocking fields'}</h2>
              <p>{correctionSummary(validation, form)}</p>
            </section>

            <section className="helper-card">
              <h2>Field status</h2>
              <ul className="field-status-list">
                <li>
                  <span>Vehicle</span>
                  <strong>{vehicleName(vehicle, draft)}</strong>
                </li>
                {correctionFields.map(([key, label]) => {
                  const issue = issueMap.get(key);
                  const status = fieldStatusFor(key, issue, form);
                  return (
                    <li key={key}>
                      <span>{label}</span>
                      <strong className={status.className}>
                        {status.label}
                        {status.hint ? <small>{status.hint}</small> : null}
                      </strong>
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="correction-sidebar-actions">
              <button type="submit" form="draft-correction-form" disabled={saving}>
                {saving ? 'Saving...' : 'Save Corrections'}
              </button>
              <button
                className="button-secondary"
                type="button"
                disabled={!readyForConfirmation}
                onClick={() => navigate(`/service-drafts/${draftId}/confirm`)}
              >
                Proceed to Confirm
              </button>
            </div>
          </aside>

          <form id="draft-correction-form" className="correction-form" onSubmit={handleSave}>
            <div className="correction-form-header">
              <div>
                <h2>Editable draft fields</h2>
                <p>{vehicleName(vehicle, draft)}</p>
              </div>
              <span className="badge subtle">{draft.status}</span>
            </div>

            <div className="correction-field-stack">
              {correctionFields.map(([key, label, type, required]) => {
                const issue = issueMap.get(key);
                const blankOptional = key === 'odometer' && !String(form.odometer ?? '').trim();
                const visibleIssue = blankOptional ? null : issue;
                const needsReview = visibleIssue?.blocksConfirmation || visibleIssue?.requiresReview;
                return (
                  <label className={needsReview ? 'correction-field needs-review' : 'correction-field'} key={key}>
                    <span className="field-label-row">
                      <span>
                        {label}
                        {required ? ' *' : ''}
                        {key === 'serviceType' ? <span className="badge subtle">Optional</span> : null}
                        {key === 'odometer' ? <span className="badge subtle">Optional</span> : null}
                      </span>
                      {blankOptional ? (
                        <span className="field-confidence-badge field-confidence-medium">Not found</span>
                      ) : badgeFor(visibleIssue) && (
                        <span className="field-confidence-badge field-confidence-low">{badgeFor(visibleIssue)}</span>
                      )}
                    </span>
                    {type === 'textarea' ? (
                      <textarea name={key} value={form[key] ?? ''} onChange={updateField} rows="3" />
                    ) : (
                      <input
                        name={key}
                        type={type}
                        min={type === 'number' ? '0' : undefined}
                        step={key === 'totalCost' ? '0.01' : undefined}
                        value={form[key] ?? ''}
                        onChange={updateField}
                      />
                    )}
                    {hintFor(visibleIssue, draft) && <small className="field-source-hint">{hintFor(visibleIssue, draft)}</small>}
                  </label>
                );
              })}
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
