import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StoredReceiptPreview from '../components/StoredReceiptPreview';
import { getServiceDraftReview, validateServiceDraft } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

const reviewFields = [
  ['serviceDate', 'Service date', 'date'],
  ['serviceType', 'Service type', 'text'],
  ['odometer', 'Odometer', 'number'],
  ['totalCost', 'Total cost', 'number'],
  ['shopName', 'Shop / mechanic', 'text'],
  ['location', 'Location', 'text'],
  ['partsReplaced', 'Parts replaced', 'textarea'],
  ['laborPerformed', 'Labor performed', 'textarea'],
  ['remarks', 'Remarks', 'textarea'],
];

const requiredFieldNames = new Set(['vehicleId', 'serviceDate', 'serviceType', 'totalCost']);
const receiptPrimaryFields = [
  ['vehicleId', 'Vehicle', 'text'],
  ['serviceDate', 'Service Date', 'date'],
  ['serviceType', 'Service Type', 'text'],
  ['totalCost', 'Total Cost', 'number'],
  ['shopName', 'Shop / Mechanic', 'text'],
  ['location', 'Location', 'text'],
  ['partsReplaced', 'Parts Replaced', 'textarea'],
  ['laborPerformed', 'Labor Performed', 'textarea'],
  ['remarks', 'Remarks', 'textarea'],
];

function draftToForm(draft) {
  return reviewFields.reduce((form, [key]) => {
    form[key] = draft?.[key] ?? '';
    return form;
  }, {});
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'Not provided';
  }
  return String(value);
}

function displaySource(draft) {
  const source = draft?.fieldMetadata?.source;
  if (source) return source;
  if (draft?.inputMethod === 'MANUAL') return 'owner_entered';
  return 'Not provided';
}

function receiptExtractionStatus(draft) {
  const metadata = draft?.fieldMetadata ?? {};
  if (metadata.fallbackUsed) {
    return 'Needs review';
  }
  if (metadata.source === 'tesseract_openai') {
    return 'Real OCR + AI used';
  }
  return 'Receipt extraction';
}

function receiptProviderLabel(draft) {
  const metadata = draft?.fieldMetadata ?? {};
  const ocr = metadata.ocrProvider || 'OCR';
  const ai = metadata.aiProvider || 'AI';
  const model = metadata.aiModel ? ` (${metadata.aiModel})` : '';
  return `${ocr} + ${ai}${model}`;
}

function buildIssueMap(validation) {
  const issueMap = new Map();
  for (const issue of validation?.flaggedFields ?? []) {
    issueMap.set(issue.fieldName, issue);
  }
  for (const issue of validation?.missingRequiredFields ?? []) {
    issueMap.set(issue.fieldName, issue);
  }
  return issueMap;
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
      sourceText: source,
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

function evidenceBadgeText(evidence, value) {
  if ((!value || value === '') && evidence?.confidence === 'not_found') return 'Missing';
  if (!evidence) return '';
  if (evidence.sourceType === 'CONFLICTING') return 'Conflicting values found';
  if (evidence.sourceType === 'INFERRED_FROM_TEXT' || evidence.sourceType === 'EXTRACTED_AND_SUMMARIZED') return 'Suggested by AI';
  if (evidence.confidence === 'not_found') return 'Missing';
  if (evidence.confidence === 'low') return 'Low confidence';
  if (evidence.needsReview) return 'Needs review';
  if (evidence.sourceType === 'EXTRACTED_FROM_TEXT') return 'Extracted from receipt';
  return '';
}

function fieldStatus(issue, draft, value) {
  const evidence = fieldEvidence(draft, issue?.fieldName);
  const evidenceState = evidenceStatus(evidence, value);
  if (evidenceState) return evidenceState;
  if (!issue && draft?.inputMethod === 'MANUAL' && value !== null && value !== undefined && value !== '') {
    return 'owner';
  }
  if (!issue) return null;
  if (issue.blocksConfirmation || ['LOW_CONFIDENCE', 'NOT_FOUND', 'MISSING_METADATA', 'UNCERTAIN'].includes(issue.category)) {
    return 'low';
  }
  if (issue.confidence === null || issue.confidence === undefined) {
    return issue.category === 'SOURCE_FIELD' ? 'source' : null;
  }
  const confidence = Number(issue.confidence);
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.75) return 'medium';
  return 'low';
}

function fieldBadgeText(issue, draft, value) {
  const evidence = fieldEvidence(draft, issue?.fieldName);
  const evidenceText = evidenceBadgeText(evidence, value);
  if (evidenceText) return evidenceText;
  if (!issue && draft?.inputMethod === 'MANUAL' && value !== null && value !== undefined && value !== '') {
    return 'Owner-entered';
  }
  if (!issue) return '';
  if (issue.blocksConfirmation) return 'Required';
  if (issue.category === 'NOT_FOUND') return 'Not found';
  if (issue.category === 'MISSING_METADATA') return 'Missing';
  if (issue.category === 'UNCERTAIN') return 'Uncertain';
  if (issue.confidence !== null && issue.confidence !== undefined) {
    const confidence = Number(issue.confidence);
    const label = confidence >= 0.8 ? 'High' : confidence >= 0.75 ? 'Medium' : 'Low';
    return `${label} ${Math.round(confidence * 100)}%`;
  }
  return issue.category === 'SOURCE_FIELD' ? 'Source' : 'Review';
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

function valueForField(key, form, draft, vehicle) {
  if (key === 'vehicleId') {
    return vehicleDisplayName(vehicle, draft);
  }
  return form[key] ?? '';
}

function confidenceStats(validation) {
  const stats = { high: 0, medium: 0, low: 0, notFound: 0, attention: 0 };
  for (const issue of validation?.flaggedFields ?? []) {
    if (issue.category === 'NOT_FOUND') {
      stats.notFound += 1;
      stats.attention += 1;
      continue;
    }
    if (['LOW_CONFIDENCE', 'MISSING_METADATA', 'UNCERTAIN'].includes(issue.category)) {
      stats.low += 1;
      stats.attention += 1;
      continue;
    }
    const confidence = Number(issue.confidence);
    if (!Number.isFinite(confidence)) continue;
    if (confidence >= 0.8) stats.high += 1;
    else if (confidence >= 0.75) stats.medium += 1;
    else {
      stats.low += 1;
      stats.attention += 1;
    }
  }
  stats.attention += validation?.missingRequiredFields?.length ?? 0;
  return stats;
}

function sourceHint(fieldName, draft) {
  const evidence = fieldEvidence(draft, fieldName);
  if (evidence?.sourceText) {
    const page = evidence.pageNumber ? `Page ${evidence.pageNumber}: ` : '';
    return `${page}${String(evidence.sourceText)}`;
  }
  if (draft?.inputMethod === 'RECEIPT') {
    return {
      vehicleId: 'Pre-selected vehicle',
      serviceDate: 'Extracted from OCR text when present',
      serviceType: 'Mapped by AI from receipt text',
      totalCost: 'Mapped from total or amount paid',
      shopName: 'Mapped from receipt header when present',
      location: 'Mapped from address text when present',
      partsReplaced: 'Mapped from itemized parts when present',
      laborPerformed: 'Mapped from service or labor lines',
      remarks: 'Raw OCR text appears here if AI extraction fails',
    }[fieldName];
  }
  if (draft?.inputMethod === 'VOICE') {
    return {
      serviceDate: 'Inferred from spoken date',
      serviceType: 'Inferred from service keywords',
      totalCost: 'Inferred from spoken cost',
      laborPerformed: 'Original transcript preserved',
    }[fieldName];
  }
  return draft?.inputMethod === 'MANUAL' ? 'Owner-entered value' : undefined;
}

function ReviewInputField({ field, form, draft, vehicle, fieldIssueMap, missingFieldNames, updateField, variant = 'standard' }) {
  const [key, label, type] = field;
  const issue = fieldIssueMap.get(key);
  const value = valueForField(key, form, draft, vehicle);
  const evidence = fieldEvidence(draft, key);
  const status = evidenceStatus(evidence, value) || fieldStatus(issue, draft, value);
  const badgeText = evidenceBadgeText(evidence, value) || fieldBadgeText(issue, draft, value);
  const flagged = missingFieldNames.has(key);
  const required = requiredFieldNames.has(key);
  const hint = sourceHint(key, draft);
  const className = [
    'review-field',
    variant === 'receipt' ? 'extraction-field-card' : '',
    flagged ? 'field-needs-review' : '',
    status ? `field-status-${status}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={className}>
      <span className="field-label-row">
        <span>
          {label}
          {required ? ' *' : ''}
        </span>
        {badgeText && <span className={`field-confidence-badge ${status ? `field-confidence-${status}` : ''}`}>{badgeText}</span>}
      </span>
      {key === 'vehicleId' ? (
        <input value={value} readOnly />
      ) : type === 'textarea' ? (
        <textarea name={key} value={form[key] ?? ''} onChange={updateField} rows={variant === 'receipt' ? '2' : '3'} />
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
      {hint && <small className="field-source-hint">{hint}</small>}
    </label>
  );
}

function classificationFromDraft(draft) {
  const classification = draft?.fieldMetadata?.classification;
  return classification && typeof classification === 'object' ? classification : null;
}

function ClassificationBadges({ draft }) {
  const classification = classificationFromDraft(draft);
  if (!classification) return null;
  const components = Array.isArray(classification.relatedComponents) ? classification.relatedComponents : [];
  return (
    <section className="classification-badges-panel">
      <div>
        <strong>Draft classification</strong>
        <span>AI-assisted suggestions. Review before saving.</span>
      </div>
      <div className="classification-badge-row">
        <span className="field-confidence-badge field-confidence-source">{classification.serviceCategory || 'Other'}</span>
        {components.slice(0, 5).map((component) => (
          <span className="field-confidence-badge field-confidence-high" key={component}>{component}</span>
        ))}
        {classification.source && <span className="field-confidence-badge field-confidence-source">Suggested by {classification.source}</span>}
        {classification.needsOwnerReview && <span className="field-confidence-badge field-confidence-low">Needs review</span>}
      </div>
    </section>
  );
}

function ReceiptPreview({ draft }) {
  const metadata = draft?.fieldMetadata ?? {};
  const rawOcrText = metadata.rawOcrText;
  const confidenceNotes = Array.isArray(metadata.confidenceNotes) ? metadata.confidenceNotes : [];
  const extractionErrors = Array.isArray(metadata.extractionErrors) ? metadata.extractionErrors : [];
  const hasRawOcrText = typeof rawOcrText === 'string' && rawOcrText.trim().length > 0;

  return (
    <section className="receipt-preview-card">
      <div className="receipt-preview-header">
        <strong>{hasRawOcrText ? 'Raw OCR text' : 'Receipt extraction source'}</strong>
        <span>{receiptProviderLabel(draft)}</span>
      </div>
      <StoredReceiptPreview source={draft} title="Saved receipt" />
      <p className="receipt-ai-reminder">AI suggestions are draft values. Please review before saving.</p>
      <details className="ocr-source-panel">
        <summary>View extracted text/source details</summary>
        <div>
          {hasRawOcrText ? (
            <pre>{rawOcrText}</pre>
          ) : (
            <div className="ocr-empty-state">
              <strong>{metadata.fallbackUsed ? 'Some details need manual review.' : 'No raw OCR text was stored.'}</strong>
              <span>
                {metadata.fallbackUsed
                  ? 'Some receipt details could not be extracted automatically. Review and complete the draft before saving.'
                  : 'The draft can still be reviewed and corrected before confirmation.'}
              </span>
            </div>
          )}

          {(confidenceNotes.length > 0 || extractionErrors.length > 0) && (
            <div className="ocr-note-list">
              {confidenceNotes.map((note) => (
                <span key={`note-${note}`}>{note}</span>
              ))}
              {extractionErrors.map((error) => (
                <span key={`error-${error}`} className="ocr-error-note">
                  {error}
                </span>
              ))}
            </div>
          )}
        </div>
      </details>

      <div className="receipt-source-facts">
        <div>
          <span>Source</span>
          <strong>{displaySource(draft)}</strong>
        </div>
        <div>
          <span>Fallback</span>
          <strong>{metadata.fallbackUsed ? 'Yes' : 'No'}</strong>
        </div>
        <div>
          <span>Model</span>
          <strong>{metadata.aiModel || 'Not configured'}</strong>
        </div>
      </div>
    </section>
  );
}

export default function ServiceDraftReviewPage() {
  const { draftId } = useParams();
  const [draft, setDraft] = useState(null);
  const [validation, setValidation] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');

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

  const missingFieldNames = useMemo(
    () => new Set((validation?.missingRequiredFields ?? []).map((issue) => issue.fieldName)),
    [validation],
  );
  const fieldIssueMap = useMemo(() => buildIssueMap(validation), [validation]);
  const reviewFlags = validation?.flaggedFields?.filter((issue) => issue.requiresReview) ?? [];
  const sourceFlags = validation?.flaggedFields?.filter((issue) => !issue.requiresReview) ?? [];
  const canContinueToConfirmation = validation?.valid;

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function runValidation() {
    setValidating(true);
    setError('');
    try {
      const result = await validateServiceDraft(draftId);
      setValidation(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setValidating(false);
    }
  }

  const commonContext = {
    draft,
    vehicle,
    form,
    validation,
    fieldIssueMap,
    missingFieldNames,
    reviewFlags,
    sourceFlags,
    canContinueToConfirmation,
    validating,
    runValidation,
    updateField,
    draftId,
  };

  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="eyebrow">
          <Link className="inline-link" to={`/service-drafts/${draftId}`}>
            Structured draft
          </Link>
          <span>Review</span>
        </p>
        <h1>Review Service Draft</h1>
        <p>Check the draft details and validation warnings before moving to correction or confirmation.</p>
      </section>

      {loading && <p className="muted">Loading review...</p>}
      {error && <div className="alert">{error}</div>}

      {draft?.inputMethod === 'RECEIPT' && <ReceiptReviewLayout {...commonContext} />}
      {draft?.inputMethod === 'VOICE' && <SourceReviewLayout {...commonContext} mode="voice" />}
      {draft?.inputMethod === 'MANUAL' && <SourceReviewLayout {...commonContext} mode="manual" />}
    </main>
  );
}

function ReceiptReviewLayout({
  draft,
  vehicle,
  form,
  validation,
  fieldIssueMap,
  missingFieldNames,
  canContinueToConfirmation,
  validating,
  runValidation,
  updateField,
  draftId,
}) {
  const stats = confidenceStats(validation);

  return (
    <section className="receipt-review-surface">
      <div className="receipt-extraction-bar">
        <div className="receipt-bar-left">
          <strong>{receiptExtractionStatus(draft)}</strong>
          <span className="mini-chip neutral">{receiptProviderLabel(draft)}</span>
          <span className="mini-chip high">{stats.high} high</span>
          <span className="mini-chip medium">{stats.medium} medium</span>
          <span className="mini-chip low">{stats.low} low</span>
          <span className="mini-chip neutral">{stats.notFound} not found</span>
        </div>
        <strong className="attention-count">{stats.attention} fields need attention</strong>
      </div>

      <div className="receipt-review-grid">
        <ReceiptPreview draft={draft} />

        <form className="auto-fields-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="auto-fields-header">
            <h2>Auto-filled fields</h2>
            <span className="badge subtle">{displaySource(draft)}</span>
          </div>
          <div className="receipt-field-stack">
            {receiptPrimaryFields.map((field) => (
              <ReviewInputField
                key={field[0]}
                field={field}
                form={form}
                draft={draft}
                vehicle={vehicle}
                fieldIssueMap={fieldIssueMap}
                missingFieldNames={missingFieldNames}
                updateField={updateField}
                variant="receipt"
              />
            ))}
          </div>
          <ClassificationBadges draft={draft} />
          <ReviewFooter
            canContinueToConfirmation={canContinueToConfirmation}
            validating={validating}
            runValidation={runValidation}
            draftId={draftId}
          />
        </form>
      </div>
    </section>
  );
}

function SourceReviewLayout(props) {
  const {
    draft,
    vehicle,
    form,
    validation,
    fieldIssueMap,
    missingFieldNames,
    reviewFlags,
    sourceFlags,
    canContinueToConfirmation,
    validating,
    runValidation,
    updateField,
    draftId,
    mode,
  } = props;
  const isVoice = mode === 'voice';

  return (
    <section className="content-two">
      <form className="panel record-panel review-form" onSubmit={(event) => event.preventDefault()}>
        <div className="draft-toolbar">
          <span className="badge">{draft.inputMethod}</span>
          <span className="badge subtle">{draft.status}</span>
          <span className="badge subtle">{displaySource(draft)}</span>
        </div>

        <div className="draft-vehicle-card">
          <span className="vehicle-icon">V</span>
          <div>
            <h2>{vehicleDisplayName(vehicle, draft)}</h2>
            <p>{vehicleSubtext(vehicle, draft)}</p>
          </div>
        </div>

        {isVoice && (
          <div className="voice-transcript-card">
            <strong>Voice transcript</strong>
            <p>{draft.fieldMetadata?.transcript || draft.laborPerformed || 'No transcript was stored with this draft.'}</p>
          </div>
        )}

        <div className="form-grid">
          {reviewFields.map((field) => (
            <ReviewInputField
              key={field[0]}
              field={field}
              form={form}
              draft={draft}
              vehicle={vehicle}
              fieldIssueMap={fieldIssueMap}
              missingFieldNames={missingFieldNames}
              updateField={updateField}
            />
          ))}
        </div>

        <ClassificationBadges draft={draft} />

        <div className="review-note">
          This review form is editable for inspection only. Use correction to save draft updates before confirmation.
        </div>

        <div className="actions">
          <button className="button-secondary" type="button" onClick={runValidation} disabled={validating}>
            {validating ? 'Validating...' : 'Run validation'}
          </button>
          <Link className="secondary-link" to={`/service-drafts/${draftId}`}>
            Back to draft
          </Link>
        </div>
      </form>

      <ValidationSidebar
        validation={validation}
        reviewFlags={reviewFlags}
        sourceFlags={sourceFlags}
        canContinueToConfirmation={canContinueToConfirmation}
        draftId={draftId}
      />
    </section>
  );
}

function ValidationSidebar({ validation, reviewFlags, sourceFlags, canContinueToConfirmation, draftId }) {
  return (
    <aside className="guidance-stack">
      <section className={validation?.valid ? 'helper-card success' : 'helper-card warning'}>
        <h2>Review summary</h2>
        <ul className="check-list">
          {(validation?.reviewSummary ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="helper-card">
        <h2>Missing required fields</h2>
        {validation?.missingRequiredFields?.length ? (
          <ul className="issue-list">
            {validation.missingRequiredFields.map((issue) => (
              <li key={`${issue.fieldName}-${issue.category}`}>
                <strong>{issue.label}</strong>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>Vehicle profile, service date, service type, and total cost are present.</p>
        )}
      </section>

      <section className="helper-card">
        <h2>Fields needing review</h2>
        {reviewFlags.length ? (
          <ul className="issue-list">
            {reviewFlags.map((issue) => (
              <li key={`${issue.fieldName}-${issue.category}`}>
                <strong>{issue.label}</strong>
                <span>
                  {issue.message}
                  {issue.confidence !== null && issue.confidence !== undefined ? ` Confidence: ${Math.round(Number(issue.confidence) * 100)}%.` : ''}
                </span>
                <small>Current value: {formatValue(issue.currentValue)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>No low-confidence, not-found, missing, or uncertain fields were flagged.</p>
        )}
      </section>

      {sourceFlags.length > 0 && (
        <section className="helper-card">
          <h2>Source-derived fields</h2>
          <div className="confidence-list">
            {sourceFlags.map((issue) => (
              <div key={`${issue.fieldName}-${issue.category}`}>
                <span>{issue.label}</span>
                <strong>{issue.confidence !== null && issue.confidence !== undefined ? `${Math.round(Number(issue.confidence) * 100)}%` : issue.source || 'Source'}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="helper-card">
        <h2>Next steps</h2>
        <div className="review-actions">
          <Link className="button-link" to={`/service-drafts/${draftId}/correct`}>
            Go to correction
          </Link>
          {canContinueToConfirmation ? (
            <Link className="button-link" to={`/service-drafts/${draftId}/confirm`}>
              Continue to confirmation
            </Link>
          ) : (
            <button type="button" disabled>
              Confirmation locked
            </button>
          )}
        </div>
        <p className="muted">Use correction for saved edits; confirmation opens when required fields are present.</p>
      </section>
    </aside>
  );
}

function ReviewFooter({ canContinueToConfirmation, validating, runValidation, draftId }) {
  return (
    <div className="receipt-review-footer">
      <button className="button-secondary" type="button" onClick={runValidation} disabled={validating}>
        {validating ? 'Validating...' : 'Run validation'}
      </button>
      <Link className="button-link" to={`/service-drafts/${draftId}/correct`}>
        Go to correction
      </Link>
      {canContinueToConfirmation ? (
        <Link className="button-link" to={`/service-drafts/${draftId}/confirm`}>
          Continue to confirmation
        </Link>
      ) : (
        <button type="button" disabled>
          Confirmation locked
        </button>
      )}
    </div>
  );
}
