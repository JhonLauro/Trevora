import { useNavigate } from 'react-router-dom';
import React, { useRef, useState } from 'react';
import { createVehicle } from '../api/vehicles.js';
import InkAuthShell from '../components/InkAuthShell.jsx';
import { InkField } from '../components/InkFormControls.jsx';
import VehicleIdentityFields from '../components/ink/VehicleIdentityFields.jsx';

const HERO = 'Now, the vehicle.';
const LEAD =
  'The car, van or motorcycle you want to keep records for. You can add more vehicles later.';

const NEXT_STEPS = [
  'Add the vehicle you drive',
  'File your first receipt against it',
  'Everything after that builds on it',
];

const CURRENT_YEAR = new Date().getFullYear();

export default function RegisterVehiclePage() {
  const navigate = useNavigate();
  // Every field that `handleSubmit` validates needs a ref here, or focusing
  // the first errored field silently does nothing.
  const fieldRefs = {
    make: useRef(null),
    model: useRef(null),
    bodyType: useRef(null),
    year: useRef(null),
    odometer: useRef(null),
  };

  const [form, setForm] = useState({
    make: '',
    model: '',
    bodyType: '',
    bodyTypeAuto: false,
    year: '',
    plateNumber: '',
    odometer: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function validateField(name, value) {
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
        if (!/^\d+$/.test(trimmed.replace(/[\s,]/g, ''))) {
          return 'Enter the reading in numbers only.';
        }
        return '';
      }
      default:
        return '';
    }
  }

  function updateIdentity(next) {
    setForm(next);
    setFormError('');
    setFieldErrors((current) => ({ ...current, make: '', model: '', bodyType: '' }));
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFormError('');
    if (fieldErrors[name]) {
      setFieldErrors((current) => ({ ...current, [name]: validateField(name, value) }));
    }
  }

  function handleBlur(event) {
    const { name, value } = event.target;
    setFieldErrors((current) => ({ ...current, [name]: validateField(name, value) }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const checked = ['make', 'model', 'bodyType', 'year', 'odometer'];
    const errors = {};
    checked.forEach((name) => {
      errors[name] = validateField(name, form[name]);
    });
    setFieldErrors(errors);

    const firstInvalid = checked.find((name) => errors[name]);
    if (firstInvalid) {
      fieldRefs[firstInvalid]?.current?.focus();
      return;
    }

    const odometer = form.odometer.trim().replace(/[\s,]/g, '');
    const payload = {
      make: form.make.trim(),
      model: form.model.trim(),
      bodyType: form.bodyType || null,
      year: Number(form.year.trim()),
      plateNumber: form.plateNumber.trim() || null,
      odometer: odometer ? Number(odometer) : null,
    };

    setSubmitting(true);
    setFormError('');

    try {
      const vehicle = await createVehicle(payload);
      navigate(`/service-input/${vehicle.vehicleId}`, { replace: true });
    } catch (err) {
      setFormError(err.message || 'We could not save this vehicle. Please try again.');
      setSubmitting(false);
    }
  }

  const aside = (
    <ol className="ink-steps">
      {NEXT_STEPS.map((step, index) => (
        <li key={step}>
          <span className="ink-steps__number">{index + 1}</span>
          <span className="ink-steps__label">{step}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <InkAuthShell hero={HERO} lead={LEAD} variant="signup" aside={aside}>
      {/* No back affordance: step 1 already created the account, so there is
          nothing coherent to go back to. */}
      <div className="ink-auth__mobile-top-row">
        <div className="ink-progress ink-progress--fluid">
          <div className="ink-progress__bars">
            <span className="ink-progress__bar" data-active="true" />
            <span className="ink-progress__bar" data-active="true" />
          </div>
          <span className="ink-progress__label">2 of 2</span>
        </div>
      </div>

      <div className="ink-heading ink-heading--signup">
        <h1>Add your vehicle</h1>
        <div className="ink-progress ink-hide-mobile">
          <div className="ink-progress__bars">
            <span className="ink-progress__bar" data-active="true" />
            <span className="ink-progress__bar" data-active="true" />
          </div>
          <p className="ink-progress__label">Step 2 of 2 — your vehicle</p>
        </div>
        <p className="ink-show-mobile-only">This is what your records get filed against.</p>
      </div>

      <form className="ink-form ink-form--signup" onSubmit={handleSubmit} noValidate>
        {/* Same three fields as the in-app Add vehicle page, from one
            component, so signup and the app cannot drift apart. */}
        <VehicleIdentityFields
          form={form}
          errors={fieldErrors}
          refs={fieldRefs}
          onChange={updateIdentity}
        />

        <InkField
          inputRef={fieldRefs.year}
          label="Model year"
          name="year"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="2018"
          maxLength={4}
          value={form.year}
          onChange={updateField}
          onBlur={handleBlur}
          error={fieldErrors.year}
        />

        <InkField
          label="Plate number"
          name="plateNumber"
          type="text"
          autoComplete="off"
          placeholder="ABC 1234"
          value={form.plateNumber}
          onChange={updateField}
          help="Leave this blank if the vehicle doesn't have plates yet."
        />

        <InkField
          inputRef={fieldRefs.odometer}
          label="Current odometer"
          name="odometer"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="45000"
          value={form.odometer}
          onChange={updateField}
          onBlur={handleBlur}
          error={fieldErrors.odometer}
          help="Optional, and roughly is fine — no need to go out and check. You can update it any time."
        />

        {formError && (
          <p className="ink-form-error" role="alert" aria-live="polite">
            {formError}
          </p>
        )}

        <button
          className={`ink-button ink-button--primary ${submitting ? 'ink-button--loading' : ''}`.trim()}
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Saving vehicle…' : 'Save and continue'}
        </button>
      </form>
    </InkAuthShell>
  );
}
