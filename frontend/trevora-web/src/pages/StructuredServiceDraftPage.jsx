import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StoredReceiptPreview from '../components/StoredReceiptPreview';
import { getServiceDraft } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

const labels = [
  ['serviceDate', 'Service date'],
  ['serviceType', 'Service type'],
  ['odometer', 'Odometer'],
  ['totalCost', 'Total cost'],
  ['shopName', 'Shop / mechanic'],
  ['location', 'Location'],
  ['partsReplaced', 'Parts replaced'],
  ['laborPerformed', 'Labor performed'],
  ['remarks', 'Remarks'],
];

function extractionStatus(draft) {
  const metadata = draft?.fieldMetadata ?? {};
  if (draft?.inputMethod !== 'RECEIPT') return null;
  if (metadata.fallbackUsed) return 'Needs review';
  if (metadata.source === 'tesseract_openai') return 'Real OCR + AI used';
  return 'Receipt extraction';
}

function sourceDisplay(draft) {
  const source = draft?.fieldMetadata?.source;
  if (draft?.inputMethod === 'RECEIPT') return 'Receipt OCR + AI';
  if (source === 'openai_voice_extraction') return 'Voice transcript + AI extraction';
  if (source === 'voice_transcript_manual_review') return 'Voice transcript only';
  if (source === 'legacy_voice_transcript_only') return 'Voice transcript only';
  if (source === 'mock_voice_transcription') return 'Legacy mock voice draft';
  if (source === 'owner_entered') return 'Owner entered';
  return source || 'Not provided';
}

function displayMode(value) {
  if (value === 'SCAN') return 'Scan';
  if (value === 'UPLOAD') return 'Upload';
  return 'Not provided';
}

function reviewCount(metadata = {}) {
  const notes = Array.isArray(metadata.confidenceNotes) ? metadata.confidenceNotes.length : 0;
  const warnings = Array.isArray(metadata.warnings) ? metadata.warnings.length : 0;
  const errors = Array.isArray(metadata.extractionErrors) ? metadata.extractionErrors.length : 0;
  const fieldSources = metadata.fieldSources && typeof metadata.fieldSources === 'object' ? metadata.fieldSources : {};
  const fieldReview = Object.values(fieldSources).filter((source) => source && typeof source === 'object' && source.needsReview).length;
  return notes + warnings + errors + fieldReview;
}

function friendlyNotes(metadata = {}) {
  const notes = Array.isArray(metadata.confidenceNotes) ? metadata.confidenceNotes : [];
  const warnings = Array.isArray(metadata.warnings) ? metadata.warnings : [];
  const errors = Array.isArray(metadata.extractionErrors) ? metadata.extractionErrors : [];
  const fallbackNote = metadata.fallbackUsed
    ? ['Some details could not be extracted automatically. Please review and complete the draft.']
    : [];
  return [...fallbackNote, ...notes, ...warnings, ...errors]
    .filter(Boolean)
    .map((note) => String(note).replace(/mock/gi, 'fallback'));
}

function fieldEvidence(metadata = {}, fieldName) {
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
    return { sourceType: source ? 'EXTRACTED_FROM_TEXT' : undefined, confidence, sourceText: source, needsReview: confidence === 'low' || confidence === 'not_found' };
  }
  return null;
}

function evidenceLabel(evidence, value) {
  if (!value || value === 'Not provided') return 'Missing';
  if (!evidence) return '';
  if (evidence.sourceType === 'CONFLICTING') return 'Conflicting values found';
  if (evidence.sourceType === 'INFERRED_FROM_TEXT' || evidence.sourceType === 'EXTRACTED_AND_SUMMARIZED') return 'Suggested by AI';
  if (evidence.confidence === 'not_found') return 'Missing';
  if (evidence.confidence === 'low' || evidence.needsReview) return 'Needs review';
  if (evidence.sourceType === 'EXTRACTED_FROM_TEXT') return 'Extracted from receipt';
  return '';
}

function evidenceClass(label) {
  if (label === 'Suggested by AI') return 'field-confidence-source';
  if (label === 'Extracted from receipt') return 'field-confidence-high';
  if (label === 'Missing' || label === 'Needs review' || label === 'Low confidence' || label === 'Conflicting values found') return 'field-confidence-low';
  return '';
}

function classificationFromDraft(draft) {
  const classification = draft?.fieldMetadata?.classification;
  return classification && typeof classification === 'object' ? classification : null;
}

export default function StructuredServiceDraftPage() {
  const { draftId } = useParams();
  const [draft, setDraft] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getServiceDraft(draftId)
      .then(async (data) => {
        if (active) {
          setDraft(data);
          setError('');
        }
        try {
          const vehicleData = await getVehicle(data.vehicleId);
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

  const confidence = draft?.fieldMetadata?.confidence ?? null;
  const rawOcrText = draft?.fieldMetadata?.rawOcrText;
  const userNotes = friendlyNotes(draft?.fieldMetadata);
  const fieldsNeedingReview = reviewCount(draft?.fieldMetadata);
  const receiptStatus = extractionStatus(draft);
  const classification = classificationFromDraft(draft);
  const relatedComponents = Array.isArray(classification?.relatedComponents) ? classification.relatedComponents : [];

  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="eyebrow">Structured draft</p>
        <h1>Structured Service Draft</h1>
        <p>This is the unified draft format created from the selected input method.</p>
      </section>

      {loading && <p className="muted">Loading draft...</p>}
      {error && <div className="alert">{error}</div>}

      {draft && (
        <section className="content-two">
          <div className="panel record-panel">
            <div className="draft-toolbar">
              <span className="badge">{draft.inputMethod}</span>
              <span className="badge subtle">{draft.status}</span>
            </div>
            <div className="review-reminder">
              Please review all extracted details before saving.
              <span>AI suggestions are draft values. Please review before saving.</span>
            </div>

            {classification && (
              <div className="classification-badges-panel">
                <div>
                  <strong>Draft classification</strong>
                  <span>Controlled category and component suggestions for service history.</span>
                </div>
                <div className="classification-badge-row">
                  <span className="field-confidence-badge field-confidence-source">{classification.serviceCategory || 'Other'}</span>
                  {relatedComponents.slice(0, 5).map((component) => (
                    <span className="field-confidence-badge field-confidence-high" key={component}>{component}</span>
                  ))}
                  {classification.needsOwnerReview && <span className="field-confidence-badge field-confidence-low">Needs review</span>}
                </div>
              </div>
            )}

            <div className="draft-vehicle-card">
              <span className="vehicle-icon">V</span>
              <div>
                <h2>{vehicle ? vehicle.nickname || `${vehicle.make} ${vehicle.model}` : 'Selected vehicle'}</h2>
                <p>
                  {vehicle
                    ? `${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}${
                        vehicle.plateNumber ? ` - ${vehicle.plateNumber}` : ''
                      }`
                    : draft.vehicleId}
                </p>
              </div>
            </div>

            <dl className="draft-list">
              {labels.map(([key, label]) => {
                const value = draft[key] || 'Not provided';
                const evidence = fieldEvidence(draft.fieldMetadata, key);
                const labelText = evidenceLabel(evidence, value);
                const lowConfidence = evidence?.confidence === 'low' && labelText !== 'Needs review' ? 'Low confidence' : '';
                return (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      <span>{value}</span>
                      <span className="field-badge-row">
                        {labelText && <span className={`field-confidence-badge ${evidenceClass(labelText)}`}>{labelText}</span>}
                        {lowConfidence && <span className="field-confidence-badge field-confidence-low">{lowConfidence}</span>}
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>

            <div className="actions">
              <Link className="secondary-link" to="/vehicles">
                Back to vehicles
              </Link>
              <Link className="button-link" to={`/service-drafts/${draft.draftId}/review`}>
                Review and validate
              </Link>
            </div>
          </div>

          <aside className="guidance-stack">
            <StoredReceiptPreview source={draft} title="Saved receipt" />

            <section className="helper-card">
              <h2>Draft source</h2>
              <dl className="compact-facts">
                <div>
                  <dt>Input method</dt>
                  <dd>{draft.inputMethod}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{sourceDisplay(draft)}</dd>
                </div>
                {draft.inputMethod === 'RECEIPT' && (
                  <>
                    <div>
                      <dt>Input mode</dt>
                      <dd>{displayMode(draft.fieldMetadata?.receiptInputMode)}</dd>
                    </div>
                    <div>
                      <dt>Pages processed</dt>
                      <dd>{draft.fieldMetadata?.pageCount ?? 1}</dd>
                    </div>
                    <div>
                      <dt>Fields needing review</dt>
                      <dd>{fieldsNeedingReview || 'None flagged'}</dd>
                    </div>
                  </>
                )}
                {receiptStatus && (
                  <div>
                    <dt>Extraction</dt>
                    <dd>{receiptStatus}</dd>
                  </div>
                )}
                {draft.inputMethod === 'RECEIPT' && (
                  <>
                    <div>
                      <dt>OCR provider</dt>
                      <dd>{draft.fieldMetadata?.ocrProvider || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt>AI model</dt>
                      <dd>{draft.fieldMetadata?.aiModel || 'Not provided'}</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>Status</dt>
                  <dd>{draft.status}</dd>
                </div>
              </dl>
              {userNotes.length > 0 && (
                <ul className="metadata-note-list">
                  {userNotes.slice(0, 4).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </section>

            {confidence && (
              <section className="helper-card">
                <h2>Confidence</h2>
                <div className="confidence-list">
                  {Object.entries(confidence).map(([key, value]) => (
                    <div key={key}>
                      <span>{key}</span>
                      <strong>{Math.round(Number(value) * 100)}%</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {draft.fieldMetadata && (
              <details className="metadata-box">
                <summary>View extracted text/source details</summary>
                {typeof rawOcrText === 'string' && rawOcrText.trim() && (
                  <>
                    <h2>Raw OCR text</h2>
                    <pre>{rawOcrText}</pre>
                  </>
                )}
                <h2>Source metadata</h2>
                <pre>{JSON.stringify(draft.fieldMetadata, null, 2)}</pre>
              </details>
            )}
          </aside>
        </section>
      )}
    </main>
  );
}
