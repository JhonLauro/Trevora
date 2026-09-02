import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateVehicle } from '../../api/vehicles.js';
import { deleteServiceDraft } from '../../api/serviceDrafts.js';

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

const FIELDS = [
  { field: 'plateNumber', metadataKey: 'receiptPlateNumber', label: 'plate number' },
  { field: 'vinChassisNumber', metadataKey: 'receiptVinChassisNumber', label: 'VIN or chassis number' },
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

/* The vehicle endpoint is a PUT that replaces the record — it calls setMake,
   setModel and the rest unconditionally — so the whole vehicle goes back with
   exactly one key changed. Sending only the new field would blank the others. */
function vehicleWithField(vehicle, field, value) {
  return {
    make: vehicle.make,
    model: vehicle.model,
    bodyType: vehicle.bodyType,
    year: vehicle.year,
    nickname: vehicle.nickname,
    plateNumber: vehicle.plateNumber,
    vinChassisNumber: vehicle.vinChassisNumber,
    odometer: vehicle.odometer,
    photoBucket: vehicle.photoBucket,
    photoPath: vehicle.photoPath,
    [field]: value,
  };
}

export default function VehicleDetailsDialog({ draft, vehicle, onVehicleUpdated }) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  const { offers, conflicts } = readVehicleDetails(draft, vehicle);
  const open = !dismissed && (offers.length > 0 || conflicts.length > 0);

  useEffect(() => {
    if (!open) return undefined;

    /* Focus lands on the safe way out, not on the button that changes the
       vehicle — the same reason ConfirmDialog focuses Cancel. */
    closeRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        setDismissed(true);
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

  async function addAll() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      let current = vehicle;
      // One request per field, in order, so a failure on the second leaves the
      // first genuinely saved rather than rolling both back invisibly.
      for (const offer of offers) {
        // eslint-disable-next-line no-await-in-loop
        current = await updateVehicle(
          current.vehicleId,
          vehicleWithField(current, offer.field, offer.value),
        );
      }
      onVehicleUpdated?.(current);
      setDismissed(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

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
    try {
      await deleteServiceDraft(draft.draftId ?? draft.serviceDraftId);
    } catch {
      // Deliberately swallowed; see above.
    }
    navigate(`/service-input/${vehicle.vehicleId}/receipt`, { replace: true });
  }

  const vehicleName = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'this vehicle';
  const conflicted = conflicts.length > 0;

  return (
    <div className="ink-modal__backdrop" onClick={() => { if (!saving) setDismissed(true); }}>
      <div
        className="ink-modal vehicle-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="vehicle-dialog-title"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="vehicle-dialog-title">
          {conflicted
            ? 'This may be the wrong vehicle'
            : `Add these to your ${vehicleName}?`}
        </h2>

        <div className="ink-modal__body">
          <p className="vehicle-dialog__lead">
            {conflicted
              ? `What this receipt prints does not match ${vehicleName}.`
              : `This receipt prints details your ${vehicleName} has no record of.`}
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
                <dt>{item.label}</dt>
                <dd>
                  <span className="vehicle-dialog__side">
                    <span>On the receipt</span>
                    <b className="vehicle-dialog__value">{item.value}</b>
                  </span>
                  <span className="vehicle-dialog__side">
                    <span>On {vehicleName}</span>
                    <b className="vehicle-dialog__value">{item.recorded}</b>
                  </span>
                </dd>
              </div>
            ))}

            {offers.map((item) => (
              <div className="vehicle-dialog__fact" key={item.field}>
                <dt>{item.label}</dt>
                <dd><b className="vehicle-dialog__value">{item.value}</b></dd>
              </div>
            ))}
          </dl>

          <p className="vehicle-dialog__advice">
            {conflicted
              ? 'Either this receipt belongs to another vehicle, or to one you have not added yet. Scanning again throws this draft away and starts over — nothing has been saved to your history.'
              : 'Read off the paper, so check it matches before adding.'}
          </p>
        </div>

        {error && <p className="ink-modal__error" role="alert">{error}</p>}

        <div className="ink-modal__actions">
          {conflicted ? (
            <>
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
                ref={closeRef}
                disabled={saving}
                onClick={() => setDismissed(true)}
              >
                Use it anyway
              </button>
              <button
                className="ink-button ink-button--primary"
                type="button"
                disabled={saving}
                onClick={scanAgain}
              >
                {saving ? 'Starting over…' : 'Scan the right receipt'}
              </button>
            </>
          ) : (
            <>
              <button
                className="ink-button ink-button--outline"
                type="button"
                ref={closeRef}
                disabled={saving}
                onClick={() => setDismissed(true)}
              >
                Not now
              </button>
              {offers.length > 0 && (
                <button
                  className="ink-button ink-button--primary"
                  type="button"
                  disabled={saving}
                  onClick={addAll}
                >
                  {saving ? 'Adding…' : offers.length > 1 ? 'Add both' : 'Add it'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
