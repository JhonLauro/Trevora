import { Link, Navigate, useNavigate } from 'react-router-dom';
import React, { useRef, useState } from 'react';
import { markOnboardingStep } from '../api/onboarding.js';
import useOnboardingGate from '../hooks/useOnboardingGate.js';
import { createVehicle } from '../api/vehicles.js';
import { removeVehiclePhoto, uploadVehiclePhoto } from '../api/vehiclePhoto.js';
import VehiclePhotoField from '../components/ink/VehiclePhotoField.jsx';
import InkLockup from '../components/InkLockup.jsx';
import { InkField } from '../components/InkFormControls.jsx';
import VehicleIdentityFields from '../components/ink/VehicleIdentityFields.jsx';

/* Not InkAuthShell any more. The shell is a two-column split with a panel on
   the left, which is right for sign in and for creating an account — both are
   short forms with room to spare beside them. This one is eight fields and a
   photo dropzone, and pushing it into the shell's other half was what made it
   a tall thin stack. It is a full-width page now.
   *
   * The root keeps the `ink-auth` class regardless: every input, label, help
   * and error style in ink-auth.css is scoped under it. That is the whole
   * reason this is not a bare <main> — dropping the class would mean
   * restyling every control on the page for no gain. */

const CURRENT_YEAR = new Date().getFullYear();

export default function RegisterVehiclePage() {
  const navigate = useNavigate();
  /* This page is the step after the walkthrough, and typing its URL was a
     way around a walkthrough that can no longer be skipped. */
  const { ready, walkthroughDone } = useOnboardingGate();
  // Every field that `handleSubmit` validates needs a ref here, or focusing
  // the first errored field silently does nothing.
  const fieldRefs = {
    make: useRef(null),
    model: useRef(null),
    bodyType: useRef(null),
    year: useRef(null),
    odometer: useRef(null),
  };

  /* Held as a file until submit, so a half-finished signup leaves no
     orphaned upload behind. */
  const [photoFile, setPhotoFile] = useState(null);

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
        // Optional — see AddVehiclePage. A secondhand owner often does not
        // know the year model, and only these two forms ever required it.
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

    setSubmitting(true);
    setFormError('');

    let photo = null;
    try {
      if (photoFile) {
        photo = await uploadVehiclePhoto(photoFile);
      }
      const vehicle = await createVehicle({
        make: form.make.trim(),
        model: form.model.trim(),
        bodyType: form.bodyType || null,
        year: form.year.trim() ? Number(form.year.trim()) : null,
        plateNumber: form.plateNumber.trim() || null,
        odometer: odometer ? Number(odometer) : null,
        photoBucket: photo?.bucket ?? null,
        photoPath: photo?.path ?? null,
      });
      /* The gate's answer just changed. Without this the app bounces the
         owner straight back here for the vehicle they have this second
         finished adding. */
      markOnboardingStep({ hasVehicle: true });
      navigate(`/service-input/${vehicle.vehicleId}`, { replace: true });
    } catch (err) {
      // Uploaded before the vehicle existed, so clean it up rather than
      // leaving a file nothing points at.
      if (photo) await removeVehiclePhoto(photo);
      setFormError(err.message || 'We could not save this vehicle. Please try again.');
      setSubmitting(false);
    }
  }

  if (!ready) {
    return null;
  }
  if (!walkthroughDone) {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <div className="ink-auth ink-auth--vehicle veh-setup">
      {/* No back affordance and no step counter: the account already exists,
          so there is nothing coherent to go back to and nothing left to
          count. The heading says what the page is for instead. */}
      <header className="veh-setup__bar">
        <Link className="ink-lockup-link" to="/" aria-label="Trevora, back to the home page">
          <InkLockup />
        </Link>
      </header>

      <main className="veh-setup__body">
        <div className="veh-setup__card">
          <div className="ink-heading ink-heading--signup">
            <h1>Add your vehicle</h1>
            <p>
              The car, van or motorcycle you want to keep records for. This is what everything
              gets filed against — you can add more vehicles later.
            </p>
          </div>

          <form className="ink-form ink-form--signup ink-form--vehicle" onSubmit={handleSubmit} noValidate>
            {/* Same three fields as the in-app Add vehicle page, from one
                component, so signup and the app cannot drift apart. */}
            <VehicleIdentityFields
              form={form}
              errors={fieldErrors}
              refs={fieldRefs}
              onChange={updateIdentity}
            />

            {/* Year, plate and odometer are all short, all optional, and were
                three more full-width rows in a column that already had five. Two
                up where there is room; ink-name-grid stacks them below 768px. */}
            <div className="ink-name-grid">
              <InkField
                inputRef={fieldRefs.year}
                label="Model year (optional)"
                name="year"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="2018"
                maxLength={4}
                value={form.year}
                onChange={updateField}
                /* Names the document it is on and the mistake it invites: "Year
                   Model" on the OR/CR is not the year the vehicle was bought. */
                help="On your OR/CR as “Year Model”. Not the year you bought it."
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
                help="Leave blank if it has no plates yet."
              />
            </div>

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
              error={fieldErrors.odometer}
              help="Optional, and roughly is fine. You can update it any time."
            />

            <VehiclePhotoField file={photoFile} onChange={setPhotoFile} disabled={submitting} />

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
        </div>
      </main>
    </div>
  );
}
