import React, { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { translate as t } from '../i18n/index.jsx';
import { useNavigate, useParams } from 'react-router-dom';
import FlowChrome from '../components/flow/FlowChrome';
import { confirmServiceDraft, getServiceDraftReview } from '../api/serviceDrafts';
import { getConcerns, setConcernResolved } from '../api/concerns';
import { hasOpenConcerns, openConcerns as onlyOpen } from '../utils/concerns';
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

/* Keys, resolved at render -- this array is built at module load, where no
   translator is bound to a language yet. */
const summaryFields = [
  ['serviceDate', 'review.dateOfService'],
  ['odometer', 'review.odometer'],
  ['totalCost', 'review.totalCost'],
  ['shopName', 'review.shopName'],
  ['location', 'review.location'],
  ['remarks', 'review.remarks'],
];

function displayValue(key, value) {
  if (value === null || value === undefined || value === '') return t('confirm.notProvided');
  if (key === 'totalCost') return formatPeso(value) ?? t('confirm.notProvided');
  if (key === 'odometer') return `${Number(value).toLocaleString()} km`;
  if (key === 'serviceDate') return formatDay(value, t('confirm.notProvided'));
  return String(value);
}

function vehicleName(vehicle, draft) {
  if (!vehicle) return draft?.vehicleId ?? t('review.selectedVehicle');
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
  const t = useT();
  const { draftId } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [validation, setValidation] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openConcerns, setOpenConcerns] = useState([]);
  const [coveredConcerns, setCoveredConcerns] = useState([]);

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
        /* Concerns are a side offer, never a reason this screen fails. If the
           list will not load the owner simply is not asked, and their concerns
           stay open — which is the safe direction to be wrong in. */
        try {
          const list = await getConcerns(data.draft.vehicleId);
          if (active) setOpenConcerns(onlyOpen(list));
        } catch {
          if (active) setOpenConcerns([]);
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
      /* After the record is safely saved, and never in a way that can undo it.
         A concern that fails to close is a tick box the owner can use again;
         a record lost to a failed concern update is not recoverable. */
      await Promise.allSettled(coveredConcerns.map((concernId) => (
        setConcernResolved(draft.vehicleId, concernId, true)
      )));
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
      title={t('confirm.title')}
      subtitle={t('confirm.notEditable')}
      onExit={() => navigate('/')}
    >
      {loading && <p className="flow-note">Loading…</p>}
      {error && <div className="flow-alert">{error}</div>}

      {draft && !validation?.valid && (
        <div className="flow-alert">
          {t('confirm.stillNeed')}
        </div>
      )}

      {draft && (
        <>
          <section className="flow-card">
            <dl className="flow-summary">
              {summaryFields.map(([key, labelKey]) => {
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
                    <dt className="flow-summary__k">{t(labelKey)}</dt>
                    <dd className="flow-summary__v">
                      <span>{displayValue(key, value)}</span>
                      {signal.label && <span className={badgeClass}>{signal.label}</span>}
                    </dd>
                  </React.Fragment>
                );
              })}

              <dt className="flow-summary__k">{t('review.whatDone')}</dt>
              <dd className="flow-summary__v flow-summary__v--stack">
                {services.length === 0 ? (
                  <span>{t('confirm.notProvided')}</span>
                ) : (
                  services.map((item, index) => (
                    <span className="flow-summary__line" key={item.itemId ?? `item-${index}`}>
                      <strong>{item.serviceType || t('confirm.service')}</strong>
                      <span>{formatPeso(item.lineCost) ?? '—'}</span>
                    </span>
                  ))
                )}
                <span className="flow-summary__foot">{linesSummary(draft)}</span>
              </dd>

              <dt className="flow-summary__k">{t('confirm.receipt')}</dt>
              <dd className="flow-summary__v">
                <span>
                  {pageCount > 0
                    ? `${pageCount} page${pageCount === 1 ? '' : 's'}, kept with the record`
                    : draft.receiptStoragePath ? 'Kept with the record' : 'None'}
                </span>
              </dd>
            </dl>
          </section>

          {/* Only when there is something to ask about. Mechanics get one short
              session and will not close anything, so the moment just after the
              owner files a record is the only reliable one — they have the visit
              in mind and the paperwork in front of them. Skippable by design:
              nothing here blocks saving. */}
          {hasOpenConcerns(openConcerns) && (
            <section className="flow-card concern-prompt">
              <h2 className="concern-prompt__title">{t('confirm.concernsTitle')}</h2>
              <p className="concern-prompt__note">{t('confirm.concernsNote')}</p>
              <ul className="concern-prompt__list">
                {openConcerns.map((concern) => (
                  <li key={concern.concernId}>
                    <label className="concern-prompt__item">
                      <input
                        type="checkbox"
                        checked={coveredConcerns.includes(concern.concernId)}
                        onChange={(event) => setCoveredConcerns((current) => (
                          event.target.checked
                            ? [...current, concern.concernId]
                            : current.filter((id) => id !== concern.concernId)
                        ))}
                      />
                      <span>{concern.note}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <label className="flow-assent">
            <input
              checked={authorized}
              onChange={(event) => setAuthorized(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="flow-assent__title">
                {t('confirm.checked')}
              </span>
              <span className="flow-assent__note">
                {t('confirm.required')}
              </span>
            </span>
          </label>

          <div className="flow-actions">
            <button
              className="flow-btn flow-btn--ghost"
              type="button"
              onClick={() => navigate(`/service-drafts/${draftId}`)}
            >
              {t('confirm.backToChecking')}
            </button>
            <button className="flow-btn" type="button" disabled={!canSave} onClick={handleConfirm}>
              {saving ? 'Saving…' : t('confirm.save')}
            </button>
          </div>
        </>
      )}
    </FlowChrome>
  );
}
