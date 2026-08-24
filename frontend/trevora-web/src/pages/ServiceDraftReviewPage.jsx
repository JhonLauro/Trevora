import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import StoredReceiptPreview from '../components/StoredReceiptPreview';
import ServiceItemsEditor from '../components/ServiceItemsEditor';
import ConfirmDialog from '../components/ink/ConfirmDialog';
import { getServiceDraftReview, updateServiceDraftCorrections } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

/**
 * The one screen between an extracted draft and confirming it.
 *
 * <p>This used to be three: a read-only "structured draft" view, a review
 * screen whose inputs were editable but discarded on navigation, and a
 * correction screen that actually saved. The owner met an editable field on
 * their second screen and a field that saved on their third, with no way to
 * tell the two apart. Everything here saves.
 */

// Order follows how a receipt is read rather than the database column order:
// when it happened, how far the vehicle had gone, what it cost, who did it.
const editableFields = [
  ['serviceDate', 'Service date', 'date', true],
  ['odometer', 'Odometer at service', 'number', false],
  ['totalCost', 'Total cost', 'number', true],
  ['shopName', 'Shop name', 'text', false],
  ['location', 'Shop location', 'text', false],
  ['remarks', 'Remarks', 'textarea', false],
];

function draftToForm(draft) {
  const form = editableFields.reduce((accumulator, [key]) => {
    accumulator[key] = draft?.[key] ?? '';
    return accumulator;
  }, {});
  form.services = Array.isArray(draft?.services) ? draft.services : [];

  // Coverage is never extracted — a receipt shows what the service cost, not
  // what an insurer later paid — so this is only ever whatever the owner has
  // already entered. The toggle is derived rather than stored: a saved amount
  // above zero is the only evidence that coverage applies.
  const covered = Number(draft?.amountCovered ?? 0);
  form.amountCovered = covered > 0 ? String(covered) : '';
  form.hasCoverage = covered > 0;
  return form;
}

function serializeCorrections(form) {
  return {
    serviceDate: form.serviceDate || null,
    odometer: form.odometer === '' ? null : Number(form.odometer),
    totalCost: form.totalCost === '' ? null : Number(form.totalCost),
    // Untick the toggle and the coverage goes back to zero rather than
    // lingering invisibly on the draft.
    amountCovered: form.hasCoverage && form.amountCovered !== '' ? Number(form.amountCovered) : 0,
    shopName: form.shopName.trim() || null,
    location: form.location.trim() || null,
    remarks: form.remarks.trim() || null,
    // lineEntries ride along inside the spread. They are the itemised receipt
    // and saving a correction rebuilds every line from this request, so
    // dropping them here would delete the breakdown.
    services: (form.services || []).map((item, index) => ({
      ...item,
      serviceType: item.serviceType?.trim() || '',
      serviceCategory: item.serviceCategory?.trim() || null,
      partsReplaced: item.partsReplaced?.trim() || null,
      laborPerformed: item.laborPerformed?.trim() || null,
      lineCost: item.lineCost === '' || item.lineCost === undefined || item.lineCost === null ? null : Number(item.lineCost),
      sortOrder: index,
    })),
  };
}

function issueMapFor(validation) {
  const issueMap = new Map();
  for (const issue of validation?.flaggedFields ?? []) {
    issueMap.set(issue.fieldName, issue);
  }
  for (const issue of validation?.missingRequiredFields ?? []) {
    issueMap.set(issue.fieldName, issue);
  }
  return issueMap;
}

/**
 * An empty odometer is the normal case, not a problem: plenty of receipts never
 * print one. Counting it as a flagged field made almost every draft look like
 * it needed work.
 */
function isBlankOptionalFieldIssue(issue, form = {}) {
  return issue?.fieldName === 'odometer' && !String(form.odometer ?? issue.currentValue ?? '').trim();
}

function attentionCountFor(validation, form) {
  const missing = validation?.missingRequiredFields?.length ?? 0;
  const flagged = (validation?.flaggedFields ?? [])
    .filter((issue) => !isBlankOptionalFieldIssue(issue, form) && issue.requiresReview)
    .length;
  return missing + flagged;
}

function fieldEvidence(draft, fieldName) {
  const metadata = draft?.fieldMetadata ?? {};
  const source = metadata.fieldSources?.[fieldName];
  const confidence = metadata.fieldConfidence?.[fieldName];
  if (source && typeof source === 'object') {
    return {
      sourceType: source.sourceType,
      confidence: source.confidence || confidence,
      sourceText: source.sourceText,
      pageNumber: source.pageNumber,
      needsReview: Boolean(source.needsReview),
    };
  }
  if (source || confidence) {
    return {
      sourceType: source ? 'EXTRACTED_FROM_TEXT' : undefined,
      confidence,
      sourceText: typeof source === 'string' ? source : undefined,
      needsReview: confidence === 'low' || confidence === 'not_found',
    };
  }
  return null;
}

function evidenceStatus(evidence, value) {
  if (!value && evidence?.confidence === 'not_found') return 'low';
  if (!evidence) return null;
  if (evidence.sourceType === 'CONFLICTING') return 'low';
  if (evidence.needsReview || evidence.confidence === 'low' || evidence.confidence === 'not_found') return 'low';
  if (evidence.sourceType === 'INFERRED_FROM_TEXT' || evidence.sourceType === 'EXTRACTED_AND_SUMMARIZED') return 'source';
  if (evidence.confidence === 'high') return 'high';
  if (evidence.confidence === 'medium') return 'medium';
  return null;
}

function evidenceBadgeText(evidence, value, draft) {
  if (!value && evidence?.confidence === 'not_found') return 'Not on receipt';
  if (!evidence) return '';
  if (evidence.sourceType === 'CONFLICTING') return 'Two different values found';
  if (evidence.sourceType === 'INFERRED_FROM_TEXT' || evidence.sourceType === 'EXTRACTED_AND_SUMMARIZED') return 'Read between the lines';
  if (evidence.confidence === 'not_found') return 'Not on receipt';
  if (evidence.confidence === 'low' || evidence.needsReview) return 'Check this one';
  if (evidence.sourceType === 'EXTRACTED_FROM_TEXT') {
    return draft?.inputMethod === 'VOICE' ? 'Heard in your note' : 'Read from receipt';
  }
  return '';
}

/** What the validator said about this field, when it said anything. */
function issueBadgeText(issue) {
  if (!issue) return '';
  if (issue.blocksConfirmation) return 'Needed to save';
  if (issue.category === 'NOT_FOUND') return 'Not on receipt';
  if (issue.category === 'MISSING_METADATA') return 'Missing';
  if (issue.category === 'UNCERTAIN') return 'Uncertain';
  if (issue.category === 'LOW_CONFIDENCE') return 'Check this one';
  return '';
}

/**
 * The snippet of the source this value came from. Only ever a real quote — an
 * earlier version filled the gap with static sentences describing how the code
 * works ("Mapped from total or amount paid"), rendered in the same place and
 * style as genuine evidence.
 */
function sourceQuote(evidence) {
  if (!evidence?.sourceText) return '';
  const page = evidence.pageNumber ? `Page ${evidence.pageNumber}: ` : '';
  return `${page}${String(evidence.sourceText)}`;
}

function vehicleDisplayName(vehicle, draft) {
  if (!vehicle) return draft?.vehicleId ?? 'Selected vehicle';
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

function vehicleSubtext(vehicle, draft) {
  if (!vehicle) return draft?.vehicleId ?? '';
  return `${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}${
    vehicle.plateNumber ? ` - ${vehicle.plateNumber}` : ''
  }`;
}

/**
 * Says what the owner will actually be recorded as having paid, so the
 * consequence of the number is visible while they type it rather than only
 * once it reaches the spend counter.
 */
function coverageHint(form) {
  const total = Number(form.totalCost);
  const covered = Number(form.amountCovered);
  if (!Number.isFinite(total) || form.totalCost === '') {
    return 'Enter the total cost first, then how much of it was covered.';
  }
  if (!Number.isFinite(covered) || form.amountCovered === '' || covered <= 0) {
    return 'How much of the total someone else paid. Leave blank if you paid all of it.';
  }
  if (covered >= total) {
    return 'Fully covered — this record will show as costing you nothing.';
  }
  return `You paid ${(total - covered).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} of ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
}

function classificationFromDraft(draft) {
  const classification = draft?.fieldMetadata?.classification;
  return classification && typeof classification === 'object' ? classification : null;
}

/** Every note the extractor left, in the order it left them. */
function extractionNotes(metadata = {}) {
  const lists = ['warnings', 'confidenceNotes', 'extractionErrors']
    .map((key) => (Array.isArray(metadata[key]) ? metadata[key] : []));
  return lists.flat().filter(Boolean).map(String);
}

function DraftField({ field, form, draft, issue, updateField }) {
  const [key, label, type, required] = field;
  const value = form[key] ?? '';
  const blankOptional = isBlankOptionalFieldIssue(issue, form);
  const visibleIssue = blankOptional ? null : issue;
  const evidence = fieldEvidence(draft, key);
  const status = evidenceStatus(evidence, value) || (visibleIssue?.requiresReview || visibleIssue?.blocksConfirmation ? 'low' : null);
  const badgeText = evidenceBadgeText(evidence, value, draft) || issueBadgeText(visibleIssue);
  const quote = sourceQuote(evidence);
  const className = [
    'review-field',
    'extraction-field-card',
    visibleIssue?.blocksConfirmation ? 'field-needs-review' : '',
    status ? `field-status-${status}` : '',
  ].filter(Boolean).join(' ');

  return (
    <label className={className}>
      <span className="field-label-row">
        <span>
          {label}
          {required ? ' *' : ''}
          {!required && key === 'odometer' ? <span className="badge subtle">Optional</span> : null}
        </span>
        {badgeText && (
          <span className={`field-confidence-badge ${status ? `field-confidence-${status}` : ''}`}>{badgeText}</span>
        )}
      </span>
      {type === 'textarea' ? (
        <textarea name={key} value={value} onChange={updateField} rows="3" />
      ) : (
        <input
          name={key}
          type={type}
          min={type === 'number' ? '0' : undefined}
          step={key === 'totalCost' ? '0.01' : undefined}
          value={value}
          onChange={updateField}
        />
      )}
      {quote && <small className="field-source-hint">{quote}</small>}
      {!quote && visibleIssue?.message && <small className="field-source-hint">{visibleIssue.message}</small>}
    </label>
  );
}

function CoverageField({ form, setForm, updateField }) {
  return (
    // Off by default and collapsed, because most records have no coverage at
    // all. A permanent amount field on every entry would tax the common path
    // to serve the rare one.
    <div className="review-field extraction-field-card">
      <label className="coverage-toggle">
        <input
          type="checkbox"
          name="hasCoverage"
          checked={Boolean(form.hasCoverage)}
          onChange={(event) => setForm((current) => ({
            ...current,
            hasCoverage: event.target.checked,
            amountCovered: event.target.checked ? current.amountCovered : '',
          }))}
        />
        <span>Insurance or warranty covered part of this</span>
      </label>

      {form.hasCoverage && (
        <div className="coverage-amount">
          <span className="field-label-row"><span>Amount covered</span></span>
          <input
            name="amountCovered"
            type="number"
            min="0"
            max={form.totalCost === '' ? undefined : form.totalCost}
            step="0.01"
            value={form.amountCovered ?? ''}
            onChange={updateField}
          />
          <small className="field-source-hint">{coverageHint(form)}</small>
        </div>
      )}
    </div>
  );
}

function ClassificationBadges({ draft }) {
  const classification = classificationFromDraft(draft);
  if (!classification) return null;
  const components = Array.isArray(classification.relatedComponents) ? classification.relatedComponents : [];
  return (
    <section className="classification-badges-panel">
      <div>
        <strong>How this will be filed</strong>
        <span>Check the category and the parts of the vehicle this touched.</span>
      </div>
      <div className="classification-badge-row">
        <span className="field-confidence-badge field-confidence-source">{classification.serviceCategory || 'Other'}</span>
        {components.slice(0, 5).map((component) => (
          <span className="field-confidence-badge field-confidence-high" key={component}>{component}</span>
        ))}
        {classification.needsOwnerReview && <span className="field-confidence-badge field-confidence-low">Check this</span>}
      </div>
    </section>
  );
}

/**
 * What the machine actually read, so a wrong value can be traced to a
 * misreading rather than guessed at.
 */
function SourcePanel({ draft }) {
  const metadata = draft?.fieldMetadata ?? {};
  const rawOcrText = metadata.rawOcrText;
  const hasRawOcrText = typeof rawOcrText === 'string' && rawOcrText.trim().length > 0;
  const notes = extractionNotes(metadata);

  return (
    <section className="receipt-preview-card">
      <div className="receipt-preview-header">
        <strong>Your receipt</strong>
        <span>
          {metadata.pageCount ? `${metadata.pageCount} page${metadata.pageCount === 1 ? '' : 's'}` : ''}
        </span>
      </div>
      <StoredReceiptPreview source={draft} title="Saved receipt" />

      {notes.length > 0 && (
        <div className="ocr-note-list">
          {notes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      )}

      <p className="receipt-ai-reminder">Check each value against the receipt before saving.</p>

      <details className="ocr-source-panel">
        <summary>See the text we read from it</summary>
        <div>
          {hasRawOcrText ? (
            <pre>{rawOcrText}</pre>
          ) : (
            <div className="ocr-empty-state">
              <strong>No text could be read from this receipt.</strong>
              <span>Fill the fields in from the receipt yourself, or go back and retake the photo.</span>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

function TranscriptPanel({ draft }) {
  return (
    <div className="voice-transcript-card">
      <strong>What you said</strong>
      <p>{draft.fieldMetadata?.transcript || 'No transcript was stored with this draft.'}</p>
    </div>
  );
}

/**
 * The blocking issues, inline.
 *
 * <p>The receipt layout is already two columns of receipt and fields, with no
 * room for a sidebar, and a reason the owner cannot save belongs next to the
 * fields rather than off to one side.
 */
function BlockingCallout({ validation }) {
  const blocking = validation?.missingRequiredFields ?? [];
  if (blocking.length === 0) return null;

  return (
    <section className="helper-card warning">
      <h2>Fix before saving</h2>
      <ul className="issue-list">
        {blocking.map((issue) => (
          <li key={`${issue.fieldName}-${issue.category}`}>
            <strong>{issue.label}</strong>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ValidationSidebar({ validation, form, draft }) {
  const blocking = validation?.missingRequiredFields ?? [];
  const needsReview = (validation?.flaggedFields ?? [])
    .filter((issue) => !isBlankOptionalFieldIssue(issue, form) && issue.requiresReview);
  const notes = draft?.inputMethod === 'RECEIPT' ? [] : extractionNotes(draft?.fieldMetadata);

  return (
    <aside className="guidance-stack">
      <section className={blocking.length ? 'helper-card warning' : 'helper-card success'}>
        <h2>{blocking.length ? 'Not ready to save yet' : 'Ready to save'}</h2>
        <ul className="check-list">
          {(validation?.reviewSummary ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {blocking.length > 0 && (
        <section className="helper-card">
          <h2>Fix before saving</h2>
          <ul className="issue-list">
            {blocking.map((issue) => (
              <li key={`${issue.fieldName}-${issue.category}`}>
                <strong>{issue.label}</strong>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {needsReview.length > 0 && (
        <section className="helper-card">
          <h2>Worth a second look</h2>
          <ul className="issue-list">
            {needsReview.map((issue) => (
              <li key={`${issue.fieldName}-${issue.category}`}>
                <strong>{issue.label}</strong>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section className="helper-card">
          <h2>Notes from reading your draft</h2>
          <ul className="metadata-note-list">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function ReviewActions({ saving, dirty, readyToConfirm, draftId, layout }) {
  const navigate = useNavigate();
  const className = layout === 'receipt' ? 'receipt-review-footer' : 'actions';

  return (
    <div className={className}>
      {/* Submits the enclosing form; the form's onSubmit is the only save path. */}
      <button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save changes'}
      </button>
      <button
        className="button-secondary"
        type="button"
        disabled={saving || dirty || !readyToConfirm}
        onClick={() => navigate(`/service-drafts/${draftId}/confirm`)}
      >
        {dirty ? 'Save first, then continue' : 'Continue to confirm'}
      </button>
    </div>
  );
}

export default function ServiceDraftReviewPage() {
  const { draftId } = useParams();
  const navigate = useNavigate();
  const [leavePrompt, setLeavePrompt] = useState(false);
  const [draft, setDraft] = useState(null);
  const [validation, setValidation] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;

    getServiceDraftReview(draftId)
      .then(async (data) => {
        if (active) {
          const initial = draftToForm(data.draft);
          setDraft(data.draft);
          setValidation(data.validation);
          setForm(initial);
          setSaved(initial);
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
  const attentionCount = attentionCountFor(validation, form);
  const readyToConfirm = (validation?.missingRequiredFields?.length ?? 0) === 0;
  // Confirming reads the saved draft, not this form, so unsaved edits would be
  // silently left behind — the exact failure this screen exists to remove.
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);

  // Closing the tab or reloading. In-app navigation away is handled by the
  // dialog below; between them, there is no path off this screen that drops an
  // edit without saying so, which is the whole point of merging these screens.
  useEffect(() => {
    if (!dirty) return undefined;
    function warn(event) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function leaveForGarage() {
    if (dirty) {
      setLeavePrompt(true);
      return;
    }
    navigate('/');
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSuccess('');
  }

  function updateServices(services) {
    setForm((current) => ({ ...current, services }));
    setSuccess('');
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await updateServiceDraftCorrections(draftId, serializeCorrections(form));
      const next = draftToForm(response.draft);
      setDraft(response.draft);
      setValidation(response.validation);
      setForm(next);
      setSaved(next);
      setSuccess((response.validation?.missingRequiredFields?.length ?? 0) === 0
        ? 'Saved. This draft is ready to confirm.'
        : 'Saved. A few required fields are still empty.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const isReceipt = draft?.inputMethod === 'RECEIPT';
  const fieldNodes = editableFields.map((field) => (
    <DraftField
      key={field[0]}
      field={field}
      form={form}
      draft={draft}
      issue={issueMap.get(field[0])}
      updateField={updateField}
    />
  ));

  return (
    <main className="page-shell module-two-page">
      <section className="page-header">
        <p className="eyebrow">
          <button className="inline-link" type="button" onClick={leaveForGarage}>
            Garage
          </button>
          <span>Review</span>
        </p>
        <h1>Check the details</h1>
        <p>
          {isReceipt
            ? 'We read these from your receipt. Fix anything that is wrong, then save.'
            : 'Fix anything that is wrong, then save.'}
        </p>
      </section>

      {loading && <p className="muted">Loading draft...</p>}
      {error && <div className="alert">{error}</div>}
      {success && <div className="alert success-alert">{success}</div>}

      {draft && isReceipt && (
        <section className="receipt-review-surface">
          <div className="receipt-extraction-bar">
            <div className="receipt-bar-left">
              <strong>{vehicleDisplayName(vehicle, draft)}</strong>
              <span className="mini-chip neutral">{vehicleSubtext(vehicle, draft)}</span>
            </div>
            <strong className="attention-count">
              {attentionCount
                ? `${attentionCount} field${attentionCount === 1 ? '' : 's'} to check`
                : 'Nothing flagged'}
            </strong>
          </div>

          <div className="receipt-review-grid">
            <SourcePanel draft={draft} />

            <form className="auto-fields-panel" onSubmit={handleSave}>
              <div className="auto-fields-header">
                <h2>Service details</h2>
                {dirty && <span className="badge subtle">Unsaved changes</span>}
              </div>
              <BlockingCallout validation={validation} />
              <div className="receipt-field-stack">
                {fieldNodes}
                <CoverageField form={form} setForm={setForm} updateField={updateField} />
              </div>
              <div className="review-field extraction-field-card">
                <span className="field-label-row">
                  <span>What was done</span>
                </span>
                <ServiceItemsEditor value={form.services} onChange={updateServices} />
              </div>
              <ClassificationBadges draft={draft} />
              <ReviewActions
                saving={saving}
                dirty={dirty}
                readyToConfirm={readyToConfirm}
                draftId={draftId}
                layout="receipt"
              />
            </form>
          </div>
        </section>
      )}

      {draft && !isReceipt && (
        <section className="content-two">
          <form className="panel record-panel review-form" onSubmit={handleSave}>
            <div className="draft-toolbar">
              <span className="badge">{draft.inputMethod === 'VOICE' ? 'Voice note' : 'Typed in'}</span>
              {dirty && <span className="badge subtle">Unsaved changes</span>}
            </div>

            <div className="draft-vehicle-card">
              <span className="vehicle-icon">V</span>
              <div>
                <h2>{vehicleDisplayName(vehicle, draft)}</h2>
                <p>{vehicleSubtext(vehicle, draft)}</p>
              </div>
            </div>

            {draft.inputMethod === 'VOICE' && <TranscriptPanel draft={draft} />}

            <div className="form-grid">{fieldNodes}</div>

            <CoverageField form={form} setForm={setForm} updateField={updateField} />

            <div className="review-field">
              <span className="field-label-row">
                <span>What was done</span>
              </span>
              <ServiceItemsEditor value={form.services} onChange={updateServices} />
            </div>

            <ClassificationBadges draft={draft} />

            <ReviewActions
              saving={saving}
              dirty={dirty}
              readyToConfirm={readyToConfirm}
              draftId={draftId}
              layout="standard"
            />
          </form>

          <ValidationSidebar validation={validation} form={form} draft={draft} />
        </section>
      )}

      <ConfirmDialog
        open={leavePrompt}
        title="Leave without saving?"
        body="Your changes to this draft have not been saved. Leaving now discards them and the draft keeps the values it was created with."
        confirmLabel="Discard changes"
        onConfirm={() => navigate('/')}
        onCancel={() => setLeavePrompt(false)}
      />
    </main>
  );
}
