import React, { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { translate as t } from '../i18n/index.jsx';
import { useNavigate, useParams } from 'react-router-dom';
import FlowChrome from '../components/flow/FlowChrome';
import ReceiptStrip from '../components/flow/ReceiptStrip';
import ReviewField, { signalFor } from '../components/flow/ReviewField';
import RecordIssueBand from '../components/flow/RecordIssueBand';
import DuplicateDraftDialog from '../components/flow/DuplicateDraftDialog.jsx';
import StatusRail from '../components/flow/StatusRail';
import ServiceLinesEditor, { Balance, balanceWarning } from '../components/flow/ServiceLinesEditor';
import ConfirmDialog from '../components/ink/ConfirmDialog';
import LeaveDraftDialog from '../components/flow/LeaveDraftDialog.jsx';
import { useLeaveGuard } from '../navigation/LeaveGuard.jsx';
import { serializeLineEntries } from '../utils/serviceLines';
import { issuesByField } from '../utils/fieldConfidence';
import { TIER_BLOCKING, TIER_REVIEW, TIER_SETTLED, tierFor } from '../utils/fieldTier';
import {
  deleteServiceDraft,
  getServiceDraftReview,
  updateServiceDraftCorrections,
} from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';
import VehicleDetailsDialog from '../components/flow/VehicleDetailsDialog.jsx';

/**
 * Step 4 — the one screen between an extracted draft and confirming it.
 *
 * <p>It used to be three screens: a read-only draft view, a review screen
 * whose inputs were editable but discarded on navigation, and a correction
 * screen that actually saved. Merging them fixed that. **Everything here
 * saves**, and that invariant is load-bearing — do not add a control that
 * looks editable and is not.
 *
 * <p>What this redesign changes is that there is now **one layout** rather
 * than two. Receipt drafts used to get an inline model with no sidebar, and
 * voice and manual drafts got a sidebar model. The receipt branch dropped the
 * sidebar because two columns of receipt-and-fields left no room for a third —
 * and with the sidebar went every non-blocking warning, the possible-duplicate
 * notice, and the entire review summary. On the most common path. Meanwhile
 * the count in the header still counted them, so the bar could read "3 fields
 * to check" on a screen that showed nothing to check.
 *
 * <p>The fix is structural: the receipt is a page strip above the fields
 * rather than a column beside them, which frees the second column for the
 * rail. Record-level issues get a band under the bar, because no field badge
 * can carry them. Every rail row is a jump link, so the count always resolves
 * to something reachable.
 */

// Receipt-reading order, not database column order: when it happened, how far
// the vehicle had gone, what it cost, who did it.
const editableFields = [
  ['serviceDate', 'Date of service', 'date', true],
  ['odometer', 'Odometer', 'number', false],
  ['totalCost', 'Total cost', 'number', true],
  ['shopName', 'Shop name', 'text', false],
  ['location', 'Location', 'text', false],
  ['remarks', 'Remarks', 'textarea', false],
];

const fieldDomId = (key) => `field-${key}`;
const DONE_ID = 'what-was-done';

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
    // Saving rebuilds every line from this request, so itemId and lineEntries
    // are named explicitly rather than left to ride along inside the spread.
    // itemId is what tells the server which item's existing lines these
    // replace; null means a service the owner has just added. Lines are sent in
    // display order — the server numbers them by position.
    services: (form.services || []).map((item, index) => ({
      ...item,
      itemId: item.itemId ?? null,
      serviceType: item.serviceType?.trim() || '',
      serviceCategory: item.serviceCategory?.trim() || null,
      partsReplaced: item.partsReplaced?.trim() || null,
      laborPerformed: item.laborPerformed?.trim() || null,
      lineCost: item.lineCost === '' || item.lineCost === undefined || item.lineCost === null
        ? null
        : Number(item.lineCost),
      lineEntries: serializeLineEntries(item.lineEntries),
      sortOrder: index,
    })),
  };
}

function vehicleDisplayName(vehicle, draft) {
  if (!vehicle) return draft?.vehicleId ?? t('review.selectedVehicle');
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

function vehicleSubtext(vehicle) {
  if (!vehicle) return '';
  return `${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}${
    vehicle.plateNumber ? ` · ${vehicle.plateNumber}` : ''
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
    return t('review.totalFirst');
  }
  if (!Number.isFinite(covered) || form.amountCovered === '' || covered <= 0) {
    return t('review.coveredHelp');
  }
  if (covered >= total) {
    return 'Fully covered — this record will show as costing you nothing.';
  }
  const money = (value) => value.toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `You paid ${money(total - covered)} of ${money(total)}.`;
}

/** How the source is described in the subtitle, in the owner's terms. */
function sourceLine(draft) {
  if (draft?.inputMethod === 'RECEIPT') {
    const pages = Number(draft?.fieldMetadata?.pageCount) || 0;
    return pages > 1 ? `read off a ${pages}-page receipt` : 'read off your receipt';
  }
  if (draft?.inputMethod === 'VOICE') return 'written down from your voice note';
  return 'typed in by you';
}

export default function ServiceDraftReviewPage() {
  const t = useT();
  const { draftId } = useParams();
  const navigate = useNavigate();
  const [leavePrompt, setLeavePrompt] = useState(false);
  /* Where the reader was going when they were stopped, so the dialog can
     finish the journey instead of always dumping them in the Garage. */
  const [leavingTo, setLeavingTo] = useState('/');
  const [draft, setDraft] = useState(null);
  const [validation, setValidation] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);

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

  const issueMap = useMemo(() => issuesByField(validation), [validation]);

  // The server decides. Re-deriving this on the client meant two definitions
  // of "ready" that only happened to agree.
  const readyToConfirm = Boolean(validation?.valid);

  // Confirming reads the saved draft, not this form, so unsaved edits would be
  // silently left behind — the exact failure this screen exists to remove.
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);

  /**
   * The rail's two lists, built from the same signals the fields render with.
   *
   * <p>Counted from what is actually drawn rather than from the raw validation
   * payload, so the heading count and the rows can never disagree — which is
   * precisely how the old bar came to promise fields that were not on screen.
   */
  const { blocking, review } = useMemo(() => {
    if (!draft) return { blocking: [], review: [] };
    const blockingItems = [];
    const reviewItems = [];

    for (const [key, label] of editableFields) {
      const issue = issueMap.get(key);
      const signal = signalFor(draft, form, key, issue);
      const tier = tierFor(signal);
      if (tier === TIER_SETTLED) continue;
      const entry = {
        id: fieldDomId(key),
        name: label,
        why: issue?.message || signal.label,
      };
      if (tier === TIER_BLOCKING) blockingItems.push(entry);
      else if (tier === TIER_REVIEW) reviewItems.push(entry);
    }

    // The balance gap is a property of the record's lines rather than of a
    // field, but it does have somewhere to jump to, so it lists like the rest.
    const gap = balanceWarning(form.services, form.totalCost);
    if (gap) reviewItems.push({ id: DONE_ID, name: t('review.whatDone'), why: gap });

    return { blocking: blockingItems, review: reviewItems };
  }, [draft, form, issueMap]);

  const duplicateIssue = useMemo(() => {
    if (duplicateDismissed) return null;
    return (validation?.flaggedFields ?? [])
      .find((issue) => issue.category === 'POSSIBLE_DUPLICATE') ?? null;
  }, [validation, duplicateDismissed]);

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

  /*
   * "Save and finish later" now saves.
   *
   * It was wired to leaveFlow -- the same handler as Exit -- so the one
   * control that promised to keep the work did not write anything, and on a
   * dirty form it opened "Leave without saving?" and offered to discard it.
   * The button did the opposite of its label.
   *
   * It deliberately does not check validation.valid the way Continue does.
   * An incomplete draft is the whole point of finishing later; refusing to
   * save one until it is correct would leave nothing to come back to.
   */
  async function saveAndLeave() {
    if (saving) return;

    if (dirty) {
      const validation = await saveDraft();
      // Null means the save threw and the message is on screen. Staying put
      // is the point: navigating away from a failed save is how the work
      // disappears.
      if (!validation) return;
    }

    navigate('/');
  }

  /*
   * Leaving asks, dirty or not.
   *
   * <p>It used to walk straight out when the form matched what was loaded --
   * but "no unsaved edits" is not "nothing to decide". The draft row exists
   * from the moment the receipt was read, so leaving silently left a half-read
   * draft behind either way. The question is what to do with that draft, and
   * it is worth asking even when nothing has been typed.
   */
  function leaveFlow() {
    setLeavingTo('/');
    setLeavePrompt(true);
  }

  /*
   * The same question, asked of the sidebar.
   *
   * <p>Leaving by the Leave button was always guarded; leaving by clicking
   * Garage or Records was not, and that is the likelier way out -- the nav is
   * on screen the whole time. Both now reach the same dialog.
   *
   * <p>Returning false stops the click. This screen then owns the journey: the
   * destination is remembered, and the dialog travels there once the reader has
   * decided what happens to the draft.
   */
  useLeaveGuard((to) => {
    setLeavingTo(to ?? '/');
    setLeavePrompt(true);
    return false;
  });

  /* Keep it: save whatever has been corrected, then go. A failed save keeps
     the dialog open with the error rather than leaving on a false promise. */
  async function keepAsDraft() {
    if (dirty) {
      const validation = await saveDraft();
      if (!validation) return;
    }
    setLeavePrompt(false);
    navigate(leavingTo);
  }

  /* Throw it away: the draft and its receipt pages, not merely the edits.
     Navigation happens even if the delete fails -- being stuck in a dialog is
     worse than one stray draft, and it stays deletable from the Records page. */
  async function discardDraft() {
    try {
      await deleteServiceDraft(draftId);
    } catch {
      // Deliberately swallowed; see above.
    }
    setLeavePrompt(false);
    navigate(leavingTo);
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateServices(services) {
    setForm((current) => ({ ...current, services }));
  }

  /**
   * Saves and reports what the server said back.
   *
   * <p>Returns the fresh validation rather than a bare success flag, because
   * saving is what decides whether this draft may be confirmed — and reading
   * `readyToConfirm` straight after awaiting would still hold the value from
   * before the save. Continuing has to judge on the answer it just received.
   *
   * <p>Null means the save failed and nothing moved.
   */
  async function saveDraft() {
    setSaving(true);
    setError('');

    try {
      const response = await updateServiceDraftCorrections(draftId, serializeCorrections(form));
      const next = draftToForm(response.draft);
      setDraft(response.draft);
      setValidation(response.validation);
      setForm(next);
      setSaved(next);
      return response.validation ?? null;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  /*
   * One button instead of two.
   *
   * Saving and continuing were separate controls, and Continue stayed disabled
   * until you had saved — so every visit to this screen ended in the same two
   * clicks, in the same order, every time. That is a sequence, not a choice,
   * and a sequence belongs to the machine.
   *
   * The reason it was ever split is real and still holds: confirming reads the
   * *saved* draft, not this form, so continuing with unsaved edits would
   * silently drop them. That is why this saves first and only travels if the
   * save came back clean — and if the server then flags something blocking, it
   * stays put and shows it, rather than carrying you forward on the strength
   * of a check that ran before the save.
   */
  async function handleContinue(event) {
    event?.preventDefault();
    if (saving) return;

    if (dirty) {
      const validation = await saveDraft();
      if (!validation) return;            // save failed; the error is on screen
      if (!validation.valid) return;      // saved, but the server is not happy
    } else if (!readyToConfirm) {
      return;
    }

    navigate(`/service-drafts/${draftId}/confirm`);
  }

  const counts = [
    blocking.length > 0 && `${blocking.length} to fix`,
    review.length > 0 && `${review.length} to check`,
  ].filter(Boolean).join(', ');

  const subtitle = draft
    ? `Step 4 of 6 · ${sourceLine(draft)}${counts ? ` · ${counts}` : ' · nothing flagged'}`
    : undefined;

  return (
    <FlowChrome
      step={4}
      width="wide"
      vehicleName={vehicleDisplayName(vehicle, draft)}
      title={t('review.title')}
      subtitle={subtitle}
      onExit={leaveFlow}
      onSaveLater={saveAndLeave}
      band={draft && (
        <RecordIssueBand
          issue={duplicateIssue}
          vehicleId={draft.vehicleId}
          onDismiss={() => setDuplicateDismissed(true)}
        />
      )}
    >
      {loading && <p className="flow-note">Loading…</p>}
      {error && <div className="flow-alert">{error}</div>}

      {draft && (
        <form className="flow-check" onSubmit={handleContinue}>
          <div className="flow-check__main">
            {draft.inputMethod === 'RECEIPT' && <ReceiptStrip draft={draft} />}

            {draft.inputMethod === 'VOICE' && (
              <section className="flow-card flow-source">
                <div className="flow-source__head">
                  <span className="flow-eyebrow">{t('review.yourVoiceNote')}</span>
                </div>
                <p className="flow-transcript">
                  {draft.fieldMetadata?.transcript || t('review.nothingRecorded')}
                </p>
                <p className="flow-source__foot">
                  Same layout, same rail, same badges. Only this panel differs.
                </p>
              </section>
            )}

            <section className="flow-card flow-fields">
              {editableFields.map((field) => (
                <ReviewField
                  key={field[0]}
                  field={field}
                  form={form}
                  draft={draft}
                  issue={issueMap.get(field[0])}
                  updateField={updateField}
                  fieldId={fieldDomId(field[0])}
                />
              ))}

              {/* Off by default and collapsed, because most records have no
                  coverage at all. A permanent amount field on every entry
                  would tax the common path to serve the rare one. */}
              <div className="flow-coverage" data-tip="draft-coverage">
                <label className="flow-switch">
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
                  <span className="flow-switch__track" aria-hidden="true" />
                  <span>{t('review.coveredBy')}</span>
                </label>

                {form.hasCoverage && (
                  <label className="flow-field">
                    <span>{t('review.amountCovered')}</span>
                    <input
                      name="amountCovered"
                      type="number"
                      min="0"
                      max={form.totalCost === '' ? undefined : form.totalCost}
                      step="0.01"
                      value={form.amountCovered ?? ''}
                      onChange={updateField}
                    />
                    <span className="flow-note">{coverageHint(form)}</span>
                  </label>
                )}
              </div>
            </section>

            <section className="flow-card">
              <div className="flow-done__head">
                <div>
                  <h2 className="flow-done__title">{t('review.whatDone')}</h2>
                  <p className="flow-note">{t('manual.serviceThenLines')}</p>
                </div>
              </div>
              <div style={{ padding: '18px 24px 0' }}>
                <Balance services={form.services} totalCost={form.totalCost} />
              </div>
              <ServiceLinesEditor id={DONE_ID} value={form.services} onChange={updateServices} />
            </section>
          </div>

          <StatusRail
            ready={readyToConfirm}
            blocking={blocking}
            review={review}
            vehicleName={vehicleDisplayName(vehicle, draft)}
            vehicleSubtext={vehicleSubtext(vehicle)}
            saving={saving}
            dirty={dirty}
          />
        </form>
      )}

      {/* Not a card in the rail: being filed against the wrong vehicle is
          not something anyone notices later, so it interrupts once, here,
          while the draft can still be moved. */}
      {/* A duplicate is the more definite of the two problems, and two
          stacked modals is nobody's idea of a warning — so it goes first
          and the vehicle one waits its turn. */}
      {duplicateIssue ? (
        <DuplicateDraftDialog
          issue={duplicateIssue}
          draft={draft}
          vehicleId={draft?.vehicleId ?? vehicle?.vehicleId}
          onDismiss={() => setDuplicateDismissed(true)}
        />
      ) : (
        <VehicleDetailsDialog
          draft={draft}
          vehicle={vehicle}
          onVehicleUpdated={setVehicle}
        />
      )}

      <LeaveDraftDialog
        open={leavePrompt}
        saving={saving}
        onSave={keepAsDraft}
        onDiscard={discardDraft}
        onCancel={() => setLeavePrompt(false)}
      />
    </FlowChrome>
  );
}
