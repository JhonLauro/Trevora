import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FlowChrome from '../components/flow/FlowChrome';
import { confirmServiceDraft, getServiceDraftReview } from '../api/serviceDrafts';
import { fieldSignal, issuesByField } from '../utils/fieldConfidence';
import { TIER_BLOCKING, TIER_REVIEW, tierFor } from '../utils/fieldTier';
import { getVehicle } from '../api/vehicles';
import { formatDay } from '../utils/format';
import { serviceItemsArray } from '../utils/serviceText';
import { formatPeso, lineEntriesOf, reconciliation } from '../utils/serviceLines';

/**
 * Step 5. The assent, and nothing else.
 *
 * <p>It stays its own screen: a tick box that means something needs a screen
 * where nothing else is happening. What it stops doing is re-litigating the
 * review — there are no editable fields here, so there is no second place
 * where a value can be changed and no question about which screen won.
 *
 * <p>Badges use the same strings as step 4, from the same {@link fieldSignal}.
 * A badge that changes its wording between the screen where you check a value
 * and the screen where you commit it is a badge nobody can learn to read.
 */

const summaryFields = [
  ['serviceDate', 'Date of service'],
  ['odometer', 'Odometer'],
  ['totalCost', 'Total cost'],
  ['shopName', 'Shop'],
  ['location', 'Location'],
  ['remarks', 'Remarks'],
];

function displayValue(key, value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (key === 'totalCost') return formatPeso(value) ?? 'Not provided';
  if (key === 'odometer') return `${Number(value).toLocaleString()} km`;
  if (key === 'serviceDate') return formatDay(value, 'Not provided');
  return String(value);
}

function vehicleName(vehicle, draft) {
  if (!vehicle) return draft?.vehicleId ?? 'Selected vehicle';
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

/** "5 receipt lines, in printed order · balanced" — or where the gap is. */
function linesSummary(draft) {
  const services = serviceItemsArray(draft?.services);
  const lineCount = services.reduce((sum, item) => sum + lineEntriesOf(item).length, 0);
  if (lineCount === 0) return 'No itemised lines — a total and nothing about what it paid for.';

  const balance = reconciliation(draft?.services, draft?.totalCost);
  const state = balance.state === 'match'
    ? 'balanced'
    : balance.state === 'gap' ? 'does not match the total' : 'not checked against the total';
  return `${lineCount} receipt line${lineCount === 1 ? '' : 's'}, in printed order · ${state}`;
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
  const canSave = Boolean(validation?.valid) && authorized && !saving;

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

  const services = serviceItemsArray(draft?.services);
  const pageCount = Number(draft?.fieldMetadata?.pageCount) || 0;

  return (
    <FlowChrome
      step={5}
      width="narrow"
      vehicleName={vehicleName(vehicle, draft)}
      title="This is what will be saved"
      subtitle="Nothing here is editable. Go back if anything is wrong."
      onExit={() => navigate('/')}
    >
      {loading && <p className="flow-note">Loading…</p>}
      {error && <div className="flow-alert">{error}</div>}

      {draft && !validation?.valid && (
        <div className="flow-alert">
          Some fields still need attention. Go back to checking to finish them.
        </div>
      )}

      {draft && (
        <>
          <section className="flow-card">
            <dl className="flow-summary">
              {summaryFields.map(([key, label]) => {
                const value = draft[key];
                const signal = fieldSignal({
                  draft, fieldName: key, value, issue: issueMap.get(key),
                });
                const tier = tierFor(signal);
                // Tier 1 cannot reach this screen — the server would not have
                // marked the draft valid — so only 2 and 3 are drawn.
                const badgeClass = tier === TIER_BLOCKING
                  ? 'flow-badge--1'
                  : tier === TIER_REVIEW ? 'flow-badge--2' : 'flow-badge--3';

                return (
                  <React.Fragment key={key}>
                    <dt className="flow-summary__k">{label}</dt>
                    <dd className="flow-summary__v">
                      <span>{displayValue(key, value)}</span>
                      {signal.label && <span className={badgeClass}>{signal.label}</span>}
                    </dd>
                  </React.Fragment>
                );
              })}

              <dt className="flow-summary__k">What was done</dt>
              <dd className="flow-summary__v flow-summary__v--stack">
                {services.length === 0 ? (
                  <span>Not provided</span>
                ) : (
                  services.map((item, index) => (
                    <span className="flow-summary__line" key={item.itemId ?? `item-${index}`}>
                      <strong>{item.serviceType || 'Service'}</strong>
                      <span>{formatPeso(item.lineCost) ?? '—'}</span>
                    </span>
                  ))
                )}
                <span className="flow-summary__foot">{linesSummary(draft)}</span>
              </dd>

              <dt className="flow-summary__k">Receipt</dt>
              <dd className="flow-summary__v">
                <span>
                  {pageCount > 0
                    ? `${pageCount} page${pageCount === 1 ? '' : 's'}, kept with the record`
                    : draft.receiptStoragePath ? 'Kept with the record' : 'None'}
                </span>
              </dd>
            </dl>
          </section>

          <label className="flow-assent">
            <input
              checked={authorized}
              onChange={(event) => setAuthorized(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="flow-assent__title">
                I have checked these details and they match my receipt
              </span>
              <span className="flow-assent__note">
                Required. You can edit the record later, and the change is logged.
              </span>
            </span>
          </label>

          <div className="flow-actions">
            <button
              className="flow-btn flow-btn--ghost"
              type="button"
              onClick={() => navigate(`/service-drafts/${draftId}`)}
            >
              Back to checking
            </button>
            <button className="flow-btn" type="button" disabled={!canSave} onClick={handleConfirm}>
              {saving ? 'Saving…' : 'Save to my records'}
            </button>
          </div>
        </>
      )}
    </FlowChrome>
  );
}
