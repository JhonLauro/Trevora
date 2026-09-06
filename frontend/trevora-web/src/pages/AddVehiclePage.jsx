import React, { useRef, useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { Link, useNavigate } from 'react-router-dom';
import VehicleIdentityFields, { deriveVehicleIdentity } from '../components/ink/VehicleIdentityFields.jsx';
import { createVehicle } from '../api/vehicles.js';
import { removeVehiclePhoto, uploadVehiclePhoto } from '../api/vehiclePhoto.js';
import VehiclePhotoField from '../components/ink/VehiclePhotoField.jsx';

/**
 * Add a vehicle, from inside the app.
 *
 * The signup flow has its own copy of this on the auth shell, for someone who
 * has no account yet. This one is for the owner who already has a garage and
 * is adding a second car — it shares the fields, not the framing.
 */
const CURRENT_YEAR = new Date().getFullYear();

const EMPTY = {
  make: '',
  model: '',
  bodyType: '',
  bodyTypeAuto: false,
  year: '',
  plateNumber: '',
  odometer: '',
};

export function validateVehicleField(name, value) {
  const trimmed = String(value ?? '').trim();

  switch (name) {
    case 'make':
      return trimmed ? '' : 'Enter the make or brand — Toyota, Honda, Mitsubishi and so on.';
    case 'model':
      return trimmed ? '' : 'Enter the model, like Vios or Civic.';
    case 'bodyType':
      return trimmed ? '' : 'Choose the body type so Trevora knows where the parts are.';
    case 'year': {
      // Optional. A secondhand owner often genuinely does not know the year
      // model, and the column, the API and every display path already accept
      // its absence — only this form ever demanded it. Forcing a guess writes
      // a wrong number that then looks as authoritative as a right one.
      if (!trimmed) return '';
      if (!/^\d{4}$/.test(trimmed)) return 'Enter the year as four digits, like 2018.';
      const year = Number(trimmed);
      if (year < 1886 || year > CURRENT_YEAR + 1) {
        return `Enter a year between 1886 and ${CURRENT_YEAR + 1}.`;
      }
      return '';
    }
    case 'odometer': {
      if (!trimmed) return '';
      if (!/^\d+$/.test(trimmed.replace(/[\s,]/g, ''))) return 'Enter the reading in numbers only.';
      return '';
    }
    /* The warranty terms are not on this form — they are entered from the
       vehicle page's Warranty tab, in their own dialog. Their rules live here
       because this is where every vehicle field is validated and
       EditWarrantyDialog imports the same function; splitting them out would
       mean two places to look for "what makes a vehicle field valid".

       All three are optional and independently so. An owner whose booklet says
       "3 years or 100,000 km" but who cannot find the delivery date must be
       able to save the half they have — the vehicle page reports a partial
       answer as partial rather than refusing it. */
    case 'warrantyStartDate': {
      if (!trimmed) return '';
      const date = new Date(`${trimmed}T00:00:00`);
      if (Number.isNaN(date.getTime())) return 'Enter the date the vehicle was delivered to you.';
      // Same rule as the API's @PastOrPresent. A delivery date in the future is
      // a typo, and one that reaches the server comes back as a 400 with
      // nothing attached to this field.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date > today) return 'A purchase or delivery date cannot be in the future.';
      return '';
    }
    case 'warrantyMonths': {
      if (!trimmed) return '';
      if (!/^\d+$/.test(trimmed.replace(/[\s,]/g, ''))) return 'Enter the coverage period in whole months.';
      const months = Number(trimmed.replace(/[\s,]/g, ''));
      if (months < 1) return 'Enter the coverage period in whole months, or leave it blank.';
      // 600 months is fifty years. The bound catches a period typed in days,
      // not a manufacturer being generous.
      if (months > 600) return 'That looks like days rather than months — enter the period in months.';
      return '';
    }
    case 'warrantyKmLimit': {
      if (!trimmed) return '';
      if (!/^\d+$/.test(trimmed.replace(/[\s,]/g, ''))) return 'Enter the mileage limit in numbers only.';
      const limit = Number(trimmed.replace(/[\s,]/g, ''));
      if (limit < 1) return 'Enter the mileage limit in kilometres, or leave it blank.';
      if (limit > 2000000) return 'That mileage limit looks like a typo. Enter it in kilometres.';
      return '';
    }
    default:
      return '';
  }
}

export function vehiclePayload(form, photo = null) {
  return {
    make: form.make.trim(),
    model: form.model.trim(),
    bodyType: form.bodyType || null,
    year: form.year.trim() ? Number(form.year.trim()) : null,
    plateNumber: form.plateNumber.trim() || null,
    odometer: form.odometer.trim() ? Number(form.odometer.replace(/[\s,]/g, '')) : null,
    // Where the browser put the photo, if one was chosen. The file itself
    // never reaches the API -- it goes straight to Supabase Storage, the same
    // way receipts do.
    photoBucket: photo?.bucket ?? null,
    photoPath: photo?.path ?? null,
  };
}

export default function AddVehiclePage() {
  const t = useT();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /* The chosen file, not an upload. It is sent to Storage at submit time, so
     abandoning this form leaves nothing behind. */
  const [photoFile, setPhotoFile] = useState(null);

  // Every field validate() checks needs a ref, or focusing the first errored
  // field silently does nothing.
  const refs = {
    make: useRef(null),
    model: useRef(null),
    bodyType: useRef(null),
    year: useRef(null),
    odometer: useRef(null),
  };

  function updateIdentity(next) {
    setForm(next);
    setFormError('');
    setErrors((current) => ({ ...current, make: '', model: '', bodyType: '' }));
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => deriveVehicleIdentity(current, { [name]: value }));
    setFormError('');
    if (errors[name]) setErrors((current) => ({ ...current, [name]: validateVehicleField(name, value) }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const order = ['make', 'model', 'bodyType', 'year', 'odometer'];
    const nextErrors = {};
    order.forEach((name) => {
      const message = validateVehicleField(name, form[name]);
      if (message) nextErrors[name] = message;
    });

    setErrors(nextErrors);
    const firstBad = order.find((name) => nextErrors[name]);
    if (firstBad) {
      refs[firstBad]?.current?.focus();
      return;
    }

    setSubmitting(true);
    let photo = null;
    try {
      if (photoFile) {
        photo = await uploadVehiclePhoto(photoFile);
      }
      const created = await createVehicle(vehiclePayload(form, photo));
      window.dispatchEvent(new Event('trevora:vehicles-changed'));
      navigate(created?.vehicleId ? `/vehicles/${created.vehicleId}` : '/');
    } catch (error) {
      // The photo is uploaded before the vehicle exists, so a failed save
      // would otherwise leave a file nothing points at.
      if (photo) await removeVehiclePhoto(photo);
      setFormError(error.message);
      setSubmitting(false);
    }
  }

  return (
    <main className="ink-page vehicle-form-page">
      <nav className="vehicle-crumbs" aria-label="Breadcrumb">
        <Link to="/">{t('nav.garage')}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t('addVehicle.title')}</span>
      </nav>

      <header>
        <h1 className="ink-page__title">{t('addVehicle.title')}</h1>
        <p className="ink-page__summary">
          Records, reminders and anything you share with a mechanic all hang off a vehicle.
        </p>
      </header>

      {formError && <div className="ink-alert">{formError}</div>}

      <form className="ink-card vehicle-form" onSubmit={handleSubmit} noValidate>
        <VehicleIdentityFields form={form} errors={errors} refs={refs} onChange={updateIdentity} />

        <div className="ink-combo">
          <label className="ink-combo__label" htmlFor="vehicle-year">
            Model year <span className="ink-combo__optional">optional</span>
          </label>
          <input
            id="vehicle-year"
            name="year"
            ref={refs.year}
            inputMode="numeric"
            placeholder="2018"
            value={form.year}
            aria-invalid={errors.year ? true : undefined}
            aria-describedby={`vehicle-year-hint${errors.year ? ' vehicle-year-error' : ''}`}
            onChange={updateField}
          />
          {/* Names the document it is on and the mistake it invites. "Year
              Model" on the OR/CR is not the year the vehicle was bought, and
              a secondhand owner reaching for a year will reach for that one. */}
          <p className="ink-combo__hint" id="vehicle-year-hint">
            On your OR/CR as “Year Model”. Not the year you bought it — leave this blank if
            you are not sure.
          </p>
          {errors.year && <p className="ink-combo__error" id="vehicle-year-error">{errors.year}</p>}
        </div>

        <div className="ink-combo">
          <label className="ink-combo__label" htmlFor="vehicle-plate">{t('addVehicle.plate')}</label>
          <p className="ink-combo__hint" id="vehicle-plate-hint">{t('addVehicle.nicknameHelp')}</p>
          <input
            id="vehicle-plate"
            name="plateNumber"
            placeholder="ABC 1234"
            value={form.plateNumber}
            aria-describedby="vehicle-plate-hint"
            onChange={updateField}
          />
        </div>

        <div className="ink-combo">
          <label className="ink-combo__label" htmlFor="vehicle-odometer">{t('addVehicle.odometer')}</label>
          <p className="ink-combo__hint" id="vehicle-odometer-hint">
            Optional, in kilometres. With it, service reminders are based on distance rather than dates.
          </p>
          <input
            id="vehicle-odometer"
            name="odometer"
            ref={refs.odometer}
            inputMode="numeric"
            placeholder="78200"
            value={form.odometer}
            aria-invalid={errors.odometer ? true : undefined}
            aria-describedby={errors.odometer ? 'vehicle-odometer-error' : 'vehicle-odometer-hint'}
            onChange={updateField}
          />
          {errors.odometer && <p className="ink-combo__error" id="vehicle-odometer-error">{errors.odometer}</p>}
        </div>

        <VehiclePhotoField file={photoFile} onChange={setPhotoFile} disabled={submitting} />

        <div className="vehicle-form__actions">
          <button className="ink-button" type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add vehicle'}
          </button>
          <Link className="ink-button ink-button--outline" to="/">{t('action.cancel')}</Link>
        </div>
      </form>
    </main>
  );
}
