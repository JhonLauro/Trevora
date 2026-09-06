import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/index.jsx';
import WarrantyFields, { WARRANTY_FIELDS, warrantyFormValues, warrantyPayload } from './WarrantyFields.jsx';
import { validateVehicleField } from '../../pages/AddVehiclePage.jsx';

/**
 * The three manufacturer warranty terms, on their own.
 *
 * <p>Its own dialog rather than three more rows in "Vehicle details", and not
 * on the add-a-vehicle form at all. The registration fields are read off the
 * vehicle or its OR/CR by somebody holding it; warranty terms come out of a
 * booklet in a drawer, and are the one thing here an owner has to go and find.
 * A field somebody must leave the screen to answer does not belong in a form
 * they are trying to finish — it belongs where the answer is wanted, which is
 * the Warranty tab, behind the button that says what it is for.
 *
 * <p>Reached only from that tab. Three fields, all optional, nothing gated on
 * them.
 */
/**
 * The three terms, and nothing else.
 *
 * <p>`warrantyPayload` already produces exactly the three keys, which is what
 * a PATCH body should be: the plate and VIN this dialog never showed are not
 * mentioned, so the server leaves them where they are.
 */
export function warrantyDialogPayload(form) {
  return warrantyPayload(form);
}

export default function EditWarrantyDialog({ open, vehicle, onSave, onCancel }) {
  const t = useT();
  const [form, setForm] = useState(() => warrantyFormValues(vehicle));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const dialogRef = useRef(null);
  const refs = {
    warrantyStartDate: useRef(null),
    warrantyMonths: useRef(null),
    warrantyKmLimit: useRef(null),
  };

  // Reopening after a cancel must not show the abandoned edits, so the form is
  // rebuilt from the vehicle each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setForm(warrantyFormValues(vehicle));
    setErrors({});
    setSaveError('');
    refs.warrantyStartDate.current?.focus();
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

    // Same rules as every other vehicle field, from the same function — a
    // period the API would reject should be caught here rather than coming
    // back as a 400 with no field attached.
    const nextErrors = {};
    for (const name of WARRANTY_FIELDS) {
      const message = validateVehicleField(name, form[name]);
      if (message) nextErrors[name] = message;
    }
    setErrors(nextErrors);
    const firstBad = WARRANTY_FIELDS.find((name) => nextErrors[name]);
    if (firstBad) {
      refs[firstBad]?.current?.focus();
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      await onSave(warrantyDialogPayload(form));
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ink-modal__backdrop" onClick={() => { if (!saving) onCancel(); }}>
      <form
        className="ink-modal ink-modal--form ink-modal--warranty"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehicle-warranty-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 id="vehicle-warranty-title">{t('warranty.dialog.title')}</h2>
        <p className="ink-modal__lead">{t('warranty.dialog.lead')}</p>

        <div className="ink-modal__fields">
          <WarrantyFields
            form={form}
            errors={errors}
            refs={refs}
            onChange={updateField}
            disabled={saving}
          />
        </div>

        {saveError && <p className="ink-modal__error" role="alert">{saveError}</p>}

        <div className="ink-modal__actions">
          <button
            className="ink-button ink-button--outline"
            type="button"
            disabled={saving}
            onClick={onCancel}
          >
            {t('action.cancel')}
          </button>
          <button className="ink-button" type="submit" disabled={saving}>
            {saving ? t('warranty.dialog.saving') : t('warranty.dialog.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
