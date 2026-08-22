import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import VehicleIdentityFields, { deriveVehicleIdentity } from '../components/ink/VehicleIdentityFields.jsx';
import { createVehicle } from '../api/vehicles.js';

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
      return trimmed ? '' : 'Enter the make — Toyota, Honda, Mitsubishi and so on.';
    case 'model':
      return trimmed ? '' : 'Enter the model, like Vios or Civic.';
    case 'bodyType':
      return trimmed ? '' : 'Choose the body type so Trevora knows where the parts are.';
    case 'year': {
      if (!trimmed) return 'Enter the model year.';
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
    default:
      return '';
  }
}

export function vehiclePayload(form) {
  return {
    make: form.make.trim(),
    model: form.model.trim(),
    bodyType: form.bodyType || null,
    year: Number(form.year),
    plateNumber: form.plateNumber.trim() || null,
    odometer: form.odometer.trim() ? Number(form.odometer.replace(/[\s,]/g, '')) : null,
  };
}

export default function AddVehiclePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  function handleBlur(event) {
    const { name, value } = event.target;
    setErrors((current) => ({ ...current, [name]: validateVehicleField(name, value) }));
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
    try {
      const created = await createVehicle(vehiclePayload(form));
      window.dispatchEvent(new Event('trevora:vehicles-changed'));
      navigate(created?.vehicleId ? `/vehicles/${created.vehicleId}` : '/');
    } catch (error) {
      setFormError(error.message);
      setSubmitting(false);
    }
  }

  return (
    <main className="ink-page vehicle-form-page">
      <nav className="vehicle-crumbs" aria-label="Breadcrumb">
        <Link to="/">Garage</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Add a vehicle</span>
      </nav>

      <header>
        <h1 className="ink-page__title">Add a vehicle</h1>
        <p className="ink-page__summary">
          Records, reminders and anything you share with a mechanic all hang off a vehicle.
        </p>
      </header>

      {formError && <div className="ink-alert">{formError}</div>}

      <form className="ink-card vehicle-form" onSubmit={handleSubmit} noValidate>
        <VehicleIdentityFields form={form} errors={errors} refs={refs} onChange={updateIdentity} />

        <div className="ink-combo">
          <label className="ink-combo__label" htmlFor="vehicle-year">Model year</label>
          <input
            id="vehicle-year"
            name="year"
            ref={refs.year}
            inputMode="numeric"
            placeholder="2018"
            value={form.year}
            aria-invalid={errors.year ? true : undefined}
            aria-describedby={errors.year ? 'vehicle-year-error' : undefined}
            onChange={updateField}
            onBlur={handleBlur}
          />
          {errors.year && <p className="ink-combo__error" id="vehicle-year-error">{errors.year}</p>}
        </div>

        <div className="ink-combo">
          <label className="ink-combo__label" htmlFor="vehicle-plate">Plate number</label>
          <p className="ink-combo__hint" id="vehicle-plate-hint">Optional. It is how most people recognise their own car in a list.</p>
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
          <label className="ink-combo__label" htmlFor="vehicle-odometer">Odometer</label>
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
            onBlur={handleBlur}
          />
          {errors.odometer && <p className="ink-combo__error" id="vehicle-odometer-error">{errors.odometer}</p>}
        </div>

        <div className="vehicle-form__actions">
          <button className="ink-button" type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add vehicle'}
          </button>
          <Link className="ink-button ink-button--outline" to="/">Cancel</Link>
        </div>
      </form>
    </main>
  );
}
