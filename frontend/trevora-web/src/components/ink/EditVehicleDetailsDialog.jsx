import React, { useEffect, useRef, useState } from 'react';
import VehiclePhotoField from './VehiclePhotoField.jsx';
import { removeVehiclePhoto, uploadVehiclePhoto } from '../../api/vehiclePhoto.js';
import { validateVehicleField } from '../../pages/AddVehiclePage.jsx';

/**
 * Edits the four registration fields, and only those four.
 *
 * Make, model and body type are deliberately absent. They decide which parts
 * map a vehicle gets and are answered once, under a picker that keeps them
 * agreeing with each other; a free-text box here could put "Toyota Xpander"
 * into a row the Add form spent real effort preventing. These four are the
 * ones an owner genuinely fills in later — the plate and VIN are on paperwork
 * they may not have to hand at signup, and the odometer changes every week.
 *
 * The API takes a whole vehicle, not a patch, so the unedited fields are sent
 * back exactly as they arrived. Dropping them would blank make and model on
 * every save.
 */
const FIELDS = [
  {
    name: 'plateNumber',
    label: 'Plate number',
    hint: 'Helps a mechanic confirm they are looking at the right vehicle.',
    // Checked against the DTOs, not assumed. The plate used to ride on
    // PublicQRAccessRequestResponse and MechanicAccessRequestResponse, both
    // returned unauthenticated before approval; it now travels only on the
    // session-gated MechanicSharedHistoryResponse.
    note: 'Shown to a mechanic after you approve their request. Leave blank to keep it out.',
    placeholder: 'ABC 1234',
  },
  {
    name: 'vinChassisNumber',
    label: 'VIN / chassis number',
    hint: 'The permanent vehicle identifier. Useful when selling.',
    // The VIN reaches no mechanic-facing or public response — it is only on
    // VehicleResponse, behind the owner's own token.
    note: 'Never shared with a mechanic. It stays in your account.',
    placeholder: 'PM2SA1234N1234567',
  },
  {
    name: 'year',
    label: 'Model year',
    hint: 'Improves service suggestions and the parts view. On your OR/CR as "Year Model".',
    // The one field with a specific wrong answer people reach for. Kept as its
    // own line rather than folded into the hint above: a warning that arrives
    // at the end of a sentence about something else gets skimmed past, and a
    // year model entered as a purchase year is wrong in a way nothing
    // downstream can detect.
    hintAside: 'Not the year you bought it.',
    placeholder: '2018',
    inputMode: 'numeric',
  },
  {
    name: 'odometer',
    label: 'Odometer',
    hint: 'Used to track service intervals and flag odometer regressions. In kilometres.',
    placeholder: '78200',
    inputMode: 'numeric',
  },
];

function formValues(vehicle) {
  return {
    plateNumber: vehicle?.plateNumber ?? '',
    vinChassisNumber: vehicle?.vinChassisNumber ?? '',
    year: vehicle?.year == null ? '' : String(vehicle.year),
    odometer: vehicle?.odometer == null ? '' : String(vehicle.odometer),
  };
}

export default function EditVehicleDetailsDialog({ open, vehicle, photoUrl = null, onSave, onCancel }) {
  /* A newly chosen file, and whether the existing photo is being taken away.
     Both start clean every time the dialog opens. */
  const [photoFile, setPhotoFile] = useState(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [form, setForm] = useState(() => formValues(vehicle));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);

  // Reopening after a cancel must not show the abandoned edits, so the form is
  // rebuilt from the vehicle each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setForm(formValues(vehicle));
    setErrors({});
    setSaveError('');
    // Reopening after a cancel must not remember a photo that was chosen and
    // then abandoned, nor a Remove that was never saved.
    setPhotoFile(null);
    setPhotoCleared(false);
    firstFieldRef.current?.focus();
  }, [open, vehicle]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(
        dialogRef.current?.querySelectorAll('input:not([disabled]), button:not([disabled])') ?? [],
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, saving, onCancel]);

  if (!open) return null;

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: '' }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // Same rules as the Add form — a year the API would reject should be
    // caught here rather than coming back as a 400 with no field attached.
    const nextErrors = {};
    for (const field of FIELDS) {
      const message = validateVehicleField(field.name, form[field.name]);
      if (message) nextErrors[field.name] = message;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      dialogRef.current?.querySelector(`[name="${Object.keys(nextErrors)[0]}"]`)?.focus();
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      /* The update endpoint takes the whole vehicle, so the photo pointer has
         to travel with it -- omitting it would clear the photo every time
         somebody corrected a plate. Three cases: a new file replaces it, the
         Remove button clears it, and otherwise it is passed straight back
         through untouched. */
      let photo = { bucket: vehicle.photoBucket ?? null, path: vehicle.photoPath ?? null };
      if (photoFile) {
        photo = await uploadVehiclePhoto(photoFile);
      } else if (photoCleared) {
        photo = { bucket: null, path: null };
      }

      await onSave({
        // Untouched, and required by the API — see the note above.
        make: vehicle.make,
        model: vehicle.model,
        bodyType: vehicle.bodyType || null,
        nickname: vehicle.nickname || null,
        photoBucket: photo.bucket,
        photoPath: photo.path,
        // Empty clears the field rather than saving "", so a plate typed by
        // mistake can be taken back out.
        plateNumber: form.plateNumber.trim() || null,
        vinChassisNumber: form.vinChassisNumber.trim() || null,
        year: form.year.trim() ? Number(form.year.trim()) : null,
        odometer: form.odometer.trim() ? Number(form.odometer.replace(/[\s,]/g, '')) : null,
      });

      /* The save stuck, so the file the vehicle no longer points at is litter.
         Best effort, and after the save rather than before -- a delete that
         happened first would take the photo with it if the save then failed. */
      const replaced = vehicle.photoPath && photo.path !== vehicle.photoPath;
      if (replaced) {
        await removeVehiclePhoto({ bucket: vehicle.photoBucket, path: vehicle.photoPath });
      }
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ink-modal__backdrop" onClick={() => { if (!saving) onCancel(); }}>
      <form
        className="ink-modal ink-modal--form"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehicle-details-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 id="vehicle-details-title">Vehicle details</h2>
        <p className="ink-modal__lead">
          All four are optional. Leave anything you do not know blank — a wrong number reads as
          authoritative later. Emptying a field removes it.
        </p>

        <div className="ink-modal__fields">
          {FIELDS.map((field, index) => {
            const errorId = `${field.name}-error`;
            const hintId = `${field.name}-hint`;
            return (
              <div className="ink-combo" key={field.name}>
                <label className="ink-combo__label" htmlFor={field.name}>{field.label}</label>
                {/* Both lines live in the one element the input points at, so
                    the aside is read out with the hint rather than orphaned. */}
                <p className="ink-combo__hint" id={hintId}>
                  {field.hint}
                  {field.hintAside && <span className="ink-combo__hint-aside">{field.hintAside}</span>}
                </p>
                <input
                  id={field.name}
                  name={field.name}
                  ref={index === 0 ? firstFieldRef : undefined}
                  value={form[field.name]}
                  disabled={saving}
                  inputMode={field.inputMode}
                  placeholder={field.placeholder}
                  aria-invalid={errors[field.name] ? true : undefined}
                  aria-describedby={errors[field.name] ? `${hintId} ${errorId}` : hintId}
                  onChange={updateField}
                />
                {field.note && <p className="ink-combo__note">{field.note}</p>}
                {errors[field.name] && (
                  <p className="ink-combo__error" id={errorId}>{errors[field.name]}</p>
                )}
              </div>
            );
          })}

          {/* The current photo, and the three things that can happen to it:
              leave it, replace it, remove it. Without this the dialog would be
              the one place a photo could be lost without anybody choosing to
              lose it. */}
          <div className="ink-modal__photo">
            <VehiclePhotoField
              file={photoFile}
              existingUrl={photoCleared ? null : photoUrl}
              disabled={saving}
              onChange={(file) => {
                setPhotoFile(file);
                // Choosing a file is not a removal; clearing the chooser when a
                // stored photo exists is.
                if (file) setPhotoCleared(false);
              }}
              onRemoveExisting={() => {
                setPhotoFile(null);
                setPhotoCleared(true);
              }}
            />
          </div>
        </div>

        {saveError && <p className="ink-modal__error" role="alert">{saveError}</p>}

        <div className="ink-modal__actions">
          <button
            className="ink-button ink-button--outline"
            type="button"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button className="ink-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </form>
    </div>
  );
}
