import { Link, useNavigate } from 'react-router-dom';
import React, { useRef, useState } from 'react';
import { registerUser, signInWithGoogle } from '../api/auth.js';
import InkAuthShell from '../components/InkAuthShell.jsx';
import {
  InkDivider,
  InkField,
  InkGoogleButton,
  InkPasswordField,
  InkStrengthMeter,
  passwordStrength,
} from '../components/InkFormControls.jsx';

const EMAIL_ERROR = "That address doesn't look right — check the spelling.";
const PASSWORD_HELP = 'At least 8 characters, with a number.';

const HERO = 'Start your vehicle’s file.';
const LEAD = 'One short form, then you are in. Add your first vehicle whenever you are ready — nothing here expires.';

export default function RegisterPage() {
  const navigate = useNavigate();
  const fieldRefs = {
    firstName: useRef(null),
    lastName: useRef(null),
    email: useRef(null),
    password: useRef(null),
    confirmPassword: useRef(null),
  };

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreedToTerms: false,
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Set only when Supabase is configured to require email confirmation, in
  // which case there is no session to sign the owner in with. See registerUser.
  const [confirmEmailNotice, setConfirmEmailNotice] = useState('');

  const strength = passwordStrength(form.password);

  function validateField(name, value) {
    switch (name) {
      case 'firstName':
        return value.trim() ? '' : 'Enter your first name.';
      case 'lastName':
        return value.trim() ? '' : 'Enter your last name.';
      case 'email':
        if (!value.trim()) return 'Enter an email address we can reach you at.';
        return isValidEmail(value.trim()) ? '' : EMAIL_ERROR;
      case 'password':
        if (!value) return 'Choose a password.';
        if (value.length < 8) return 'Use at least 8 characters.';
        if (!/\d/.test(value)) return 'Include at least one number.';
        return '';
      case 'confirmPassword':
        if (!value) return 'Re-type your password.';
        return value === form.password ? '' : 'These two passwords do not match.';
      default:
        return '';
    }
  }

  function updateField(event) {
    const { name, type, checked, value } = event.target;
    const nextValue = type === 'checkbox' ? checked : value;
    setForm((current) => ({ ...current, [name]: nextValue }));
    setFormError('');
    if (fieldErrors[name]) {
      setFieldErrors((current) => ({ ...current, [name]: validateField(name, nextValue) }));
    }
    // Editing the first password can fix or break the confirmation, and the
    // confirmation's own onChange will not fire. Re-check it here, but only
    // once it has already been flagged — nobody wants "does not match" the
    // moment they start typing.
    if (name === 'password' && fieldErrors.confirmPassword) {
      setFieldErrors((current) => ({
        ...current,
        confirmPassword: form.confirmPassword === nextValue ? '' : 'These two passwords do not match.',
      }));
    }
  }

  async function handleGoogleSignIn() {
    setFormError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setFormError(err.message || 'Unable to start Google sign-in.');
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const required = ['firstName', 'lastName', 'email', 'password', 'confirmPassword'];
    const errors = {};
    required.forEach((name) => {
      errors[name] = validateField(name, form[name]);
    });
    setFieldErrors(errors);

    const firstInvalid = required.find((name) => errors[name]);
    if (firstInvalid) {
      fieldRefs[firstInvalid].current?.focus();
      return;
    }

    if (!form.agreedToTerms) {
      setFormError('Please accept the Terms to continue.');
      return;
    }

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      password: form.password,
      role: 'VEHICLE_OWNER',
    };

    setSubmitting(true);
    setFormError('');

    try {
      const result = await registerUser(payload);

      if (result.requiresVerification) {
        setConfirmEmailNotice(result.message);
        return;
      }

      // Owners get the walkthrough, then the vehicle form it leads to —
      // seeing what a record is for before being asked to make one.
      // `/welcome` forwards anyone who has already been shown it, so this
      // cannot replay for an account that comes back through signup. Admins
      // have no vehicle to add and no owner flow to learn.
      navigate(result.user?.role === 'ADMIN' ? '/dashboard' : '/welcome', { replace: true });
    } catch (err) {
      if (err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        setConfirmEmailNotice(
          `Check ${payload.email} and click the confirmation link, then sign in.`,
        );
        return;
      }
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <InkAuthShell hero={HERO} lead={LEAD} variant="signup">
      <div className="ink-auth__mobile-top-row">
        <Link className="ink-back-button" to="/login" aria-label="Back to sign in">
          ←
        </Link>
      </div>

      {/* One step, so no step meter: a progress bar reading "1 of 1" is
          noise, and the vehicle form it used to count towards is out of the
          flow for now. */}
      <div className="ink-heading ink-heading--signup">
        <h1>Create your account</h1>
        <p>Name, email, a password — that is the whole of it.</p>
      </div>

      {confirmEmailNotice && (
        <p className="ink-notice" role="status" aria-live="polite">
          {confirmEmailNotice}
        </p>
      )}

      <form className="ink-form ink-form--signup" onSubmit={handleSubmit} noValidate>
        <InkGoogleButton loading={googleLoading} disabled={submitting} onClick={handleGoogleSignIn} />

        <InkDivider />

        {/* Two fields at every width — first_name/last_name are NOT NULL and a
            single "Full name" input forces a guessed split that loses the
            second half of compound surnames. Stacks on mobile, never side by
            side on a narrow screen. */}
        <div className="ink-name-grid">
          <InkField
            inputRef={fieldRefs.firstName}
            label="First name"
            name="firstName"
            type="text"
            autoComplete="given-name"
            value={form.firstName}
            onChange={updateField}
            error={fieldErrors.firstName}
          />
          <InkField
            inputRef={fieldRefs.lastName}
            label="Last name"
            name="lastName"
            type="text"
            autoComplete="family-name"
            value={form.lastName}
            onChange={updateField}
            error={fieldErrors.lastName}
          />
        </div>

        <InkField
          inputRef={fieldRefs.email}
          label="Email address"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={form.email}
          onChange={updateField}
          error={fieldErrors.email}
        />

        <div className="ink-password-block">
          <InkPasswordField
            inputRef={fieldRefs.password}
            name="password"
            autoComplete="new-password"
            value={form.password}
            onChange={updateField}
            error={fieldErrors.password}
          />
          {/* The requirement rides with the meter now, so the field no longer
              renders it separately — it was appearing twice over otherwise.
              Both stay hidden until there is a password to measure: four empty
              bars and a rule beside an untouched field is a demand, and it was
              the first thing on the form that looked like a failure. */}
          {form.password && (
            <div className="ink-hide-mobile">
              <InkStrengthMeter score={strength} hint={PASSWORD_HELP} />
            </div>
          )}
        </div>

        <InkPasswordField
          label="Confirm password"
          inputRef={fieldRefs.confirmPassword}
          name="confirmPassword"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={updateField}
          error={fieldErrors.confirmPassword}
          help={fieldErrors.confirmPassword ? undefined : 'Re-type it so we know it is what you meant.'}
        />

        <div className="ink-spacer ink-show-mobile-only" />

        {/* Not a <label>. The sentence contains two links, and inside a label
            a click on either one activates the label — toggling the checkbox
            instead of opening the document the reader is being asked to
            agree to. The input keeps its own `aria-label`, so it is still
            named; what is lost is click-the-words-to-tick, which is the
            right thing to trade away here. */}
        <div className="ink-check">
          <input
            type="checkbox"
            name="agreedToTerms"
            aria-label="I agree to the Terms of Service and Privacy Policy"
            checked={form.agreedToTerms}
            onChange={updateField}
          />
          <span className="ink-check__label ink-check__label--small">
            I agree to the{' '}
            {/* Router links, not bare anchors. As <a href> these did a full
                page load into a route that did not exist, so the catch-all
                bounced the reader to /login and lost the half-filled form. */}
            <Link className="ink-link" to="/terms">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link className="ink-link" to="/privacy">
              Privacy Policy
            </Link>
            .
          </span>
        </div>

        <p className="ink-form-error" role="alert" aria-live="polite">
          {formError}
        </p>

        <button
          type="submit"
          className={`ink-button ink-button--primary ${submitting ? 'ink-button--loading' : ''}`.trim()}
          disabled={submitting}
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="ink-footer-note ink-hide-mobile">
        Already have an account?{' '}
        <Link className="ink-link" to="/login">
          Sign in
        </Link>
      </p>
    </InkAuthShell>
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
