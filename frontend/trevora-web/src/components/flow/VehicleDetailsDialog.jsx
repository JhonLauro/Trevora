import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/index.jsx';
import { useNavigate } from 'react-router-dom';
import { discardDraftAndRescan } from '../../utils/rescanDraft.js';
import { insistOnAnswer } from '../../utils/insistOnAnswer.js';

/**
 * What the receipt says about the vehicle, asked as a question.
 *
 * <p>Two different things can be true once a receipt has been read, and they
 * want opposite responses:
 *
 * <ul>
 *   <li><b>The vehicle has no plate or chassis recorded and the receipt prints
 *       one.</b> That is an offer: add it, or do not.</li>
 *   <li><b>Both have one and they disagree.</b> That is not an offer at all.
 *       Either this receipt belongs to a different car, or it belongs to one
 *       the owner has not added yet. Nothing here can tell which, and neither
 *       value should be touched — the point is to say so before a record is
 *       filed under the wrong vehicle, which is the kind of mistake a service
 *       history never recovers from because nobody goes looking for it.</li>
 * </ul>
 *
 * <p>It interrupts because it is about the thing the whole record hangs on. A
 * card in the rail can be scrolled past; being filed against the wrong car
 * cannot be noticed later.
 */

/* labelKey, not label: this array is built at module load, where no language
   is bound yet. Both dialogs resolve it where they render. */
const FIELDS = [
  { field: 'plateNumber', metadataKey: 'receiptPlateNumber', labelKey: 'veh.plateNumber' },
  { field: 'vinChassisNumber', metadataKey: 'receiptVinChassisNumber', labelKey: 'veh.vinNumber' },
];

/** Loose comparison: spaces, dashes and case are not disagreements. */
function sameIdentifier(a, b) {
  const clean = (value) => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean(a) === clean(b);
}

/**
 * What this receipt has to say about this vehicle.
 *
 * @returns {{offers: Array, conflicts: Array}} offers are empty fields the
 *     receipt could fill; conflicts are fields where the two disagree.
 */
export function readVehicleDetails(draft, vehicle) {
  const empty = { offers: [], conflicts: [] };
  if (!draft || !vehicle) return empty;
  const metadata = draft.fieldMetadata ?? {};

  return FIELDS.reduce((found, entry) => {
    const printed = metadata[entry.metadataKey];
    if (typeof printed !== 'string' || !printed.trim()) return found;

    const recorded = vehicle[entry.field];
    const hasRecorded = typeof recorded === 'string' && recorded.trim().length > 0;

    if (!hasRecorded) {
      found.offers.push({ ...entry, value: printed.trim() });
    } else if (!sameIdentifier(printed, recorded)) {
      found.conflicts.push({ ...entry, value: printed.trim(), recorded: recorded.trim() });
    }
    // Same value, differently punctuated, is agreement. Nothing to say.
    return found;
  }, empty);
}

/*
 * One field, as a patch body.
 *
 * This used to hand back the whole vehicle with one key changed, because the
 * endpoint was a PUT that replaced the record — and that list of keys was a
 * copy of the columns, maintained by hand. It went stale the moment warranty
 * terms were added: they were not in the list, so accepting a plate number
 * offered by a receipt silently wiped an owner's coverage. Nothing failed, and
 * nothing on screen said so.
 *
 * The endpoint is a PATCH now. A field not named is not touched, so the body is
 * the field — and there is no list to keep in step with the schema.
 */
export function vehicleWithField(vehicle, field, value) {
  return { [field]: value };
}

export default function VehicleDetailsDialog({ draft, vehicle, onVehicleUpdated }) {
  const t = useT();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef(null);

  /* Conflicts only. The offer half moved to VehicleDetailsOffer on the saved
     screen: it is an errand about the vehicle profile, not about the record
     being filed, and it does not deserve a modal on the busiest path in the
     app. A conflict is the opposite -- the receipt may belong to another car,
     and after the record is filed nobody ever goes looking for it. */
  const { conflicts } = readVehicleDetails(draft, vehicle);
  const open = !dismissed && conflicts.length > 0;

  useEffect(() => {
    if (!open) return undefined;

    /* The dialog takes focus, not a button.
       Focusing a button on open painted its focus ring the moment the dialog
       appeared -- a green outline on "It is a different service" that nobody
       had asked for, and that stayed put through clicks on either button
       because clicking a button focuses it. Focus has to go somewhere inside
       for the trap and for screen readers, and the WAI-ARIA practice for a
       dialog is the dialog itself: it is announced, it is not a control, and
       it draws no ring. Tab from here still reaches the buttons in order. */
    dialogRef.current?.focus();

    function onKeyDown(event) {
      /* Escape does not close this either. On a conflict, closing means "use
         it anyway" -- filing the record against a vehicle the receipt does not
         match, which is the mistake nobody ever finds again. */
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!saving) insistOnAnswer(dialogRef.current);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll('button:not([disabled])') ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, saving]);

  if (!open) return null;

  /*
   * Start over with the right paper.
   *
   * The draft is deleted rather than abandoned. A draft left behind counts
   * itself in the Garage's "needs review" and asks to be finished — a nag for
   * work the owner has just been told not to do. If the delete fails the
   * navigation still happens: a stray draft is a smaller problem than being
   * stuck in a dialog with nowhere to go.
   */
  async function scanAgain() {
    if (saving) return;
    setSaving(true);
    await discardDraftAndRescan({ draft, vehicleId: vehicle.vehicleId, navigate });
  }

  const vehicleName = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'this vehicle';

  return (
    <div
      className="ink-modal__backdrop"
      onClick={() => {
        if (saving) return;
        insistOnAnswer(dialogRef.current);
        dialogRef.current?.focus();
      }}
    >
      <div
        className="ink-modal vehicle-dialog"
        role="alertdialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="vehicle-dialog-title"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="vehicle-dialog-title">{t('veh.wrongVehicle')}</h2>

        <div className="ink-modal__body">
          <p className="vehicle-dialog__lead">
            {t('veh.doesNotMatch', { vehicle: vehicleName })}
          </p>

          {/* A comparison, not a sentence. Two prose paragraphs saying "the
              receipt shows X and the vehicle has none recorded" repeated the
              same frame twice and buried the only part that varies. Labels
              left, values right, so the eye reads down the column it cares
              about — and for a conflict, the two values sit one above the
              other where the difference is visible rather than described. */}
          <dl className="vehicle-dialog__facts">
            {conflicts.map((item) => (
              <div className="vehicle-dialog__fact is-conflict" key={item.field}>
                <dt>{t(item.labelKey)}</dt>
                <dd>
                  <span className="vehicle-dialog__side">
                    <span>{t('veh.onReceipt')}</span>
                    <b className="vehicle-dialog__value">{item.value}</b>
                  </span>
                  <span className="vehicle-dialog__side">
                    <span>{t('veh.onVehicle', { vehicle: vehicleName })}</span>
                    <b className="vehicle-dialog__value">{item.recorded}</b>
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          <p className="vehicle-dialog__advice">
            {t('veh.eitherOr')}
          </p>
        </div>

        <div className="ink-modal__actions">
          {/* The way out is kept, and deliberately.

              A conflict can be a misread rather than a wrong receipt --
              OCR reads O as 0 and I as 1, which is the whole reason this
              asks instead of writing values in. Forcing a rescan on a
              false conflict would send someone back to photograph the same
              paper and get the same misread, with no way past it. So
              scanning again is the loud option and continuing is the
              quiet one, rather than the only one being a dead end. */}
          <button
            className="ink-button ink-button--outline"
            type="button"
            disabled={saving}
            onClick={() => setDismissed(true)}
          >
            {t('veh.useAnyway')}
          </button>
          <button
            className="ink-button ink-button--primary"
            type="button"
            disabled={saving}
            onClick={scanAgain}
          >
            {saving ? t('dup.startingOver') : t('veh.scanRight')}
          </button>
        </div>
      </div>
    </div>
  );
}
