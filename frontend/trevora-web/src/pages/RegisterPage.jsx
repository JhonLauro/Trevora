import { Link, useNavigate } from 'react-router-dom';
import React, { useRef, useState } from 'react';
import { registerUser, signInWithGoogle, verifyRegistrationOtp } from '../api/auth.js';
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
const LEAD = 'Two short steps. Your account first, then the vehicle you want to keep records for.';

export default function RegisterPage() {
  const navigate = useNavigate();
  const fieldRefs = {
    firstName: useRef(null),
    lastName: useRef(null),
    email: useRef(null),
    password: useRef(null),
  };

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    agreedToTerms: false,
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [pendingVerification, setPendingVerification] = useState(null);
  const [verificationNotice, setVerificationNotice] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verifying, setVerifying] = useState(false);

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
  }

  function handleBlur(event) {
    const { name, value } = event.target;
    setFieldErrors((current) => ({ ...current, [name]: validateField(name, value) }));
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
    const required = ['firstName', 'lastName', 'email', 'password'];
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
      setPendingVerification({ ...payload, otpType: result.otpType });
      setVerificationNotice(`${result.message} Enter the code sent to ${payload.email}.`);
    } catch (err) {
      if (err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        setPendingVerification(payload);
        setVerificationNotice(`Enter the verification code sent to ${payload.email}.`);
        return;
      }
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyAccount(event) {
    event.preventDefault();
    const token = otpCode.trim().replace(/\s+/g, '');

    if (!token) {
      setFormError('Enter the verification code from your email.');
      return;
    }

    setVerifying(true);
    setFormError('');

    try {
      const user = await verifyRegistrationOtp({ ...pendingVerification, token });
      // Owners continue to step 2 (their first vehicle); admins have no vehicle
      // to add, so they go straight to the dashboard.
      navigate(user.role === 'ADMIN' ? '/dashboard' : '/register/vehicle', { replace: true });
    } catch (err) {
      setFormError(err.message || 'Unable to verify this code. Please try again.');
      setVerifying(false);
    }
  }

  const asideCard = (
    <div className="ink-quote-card">
      <p className="ink-quote-card__eyebrow">Why owners keep one</p>
      <p className="ink-quote-card__quote">
        A complete, validated history is the difference between haggling and naming your price.
      </p>
    </div>
  );

  if (pendingVerification) {
    return (
      <InkAuthShell hero={HERO} lead={LEAD} variant="signup" aside={asideCard}>
        <div className="ink-heading">
          <h1>Check your email</h1>
          <p>Enter the code we sent so we can finish setting up your account.</p>
        </div>

        {verificationNotice && <p className="ink-notice">{verificationNotice}</p>}

        <form className="ink-form ink-form--signup" onSubmit={handleVerifyAccount} noValidate>
          <InkField
            label="Verification code"
            name="otpCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otpCode}
            onChange={(event) => {
              setOtpCode(event.target.value);
              setFormError('');
            }}
          />

          <p className="ink-form-error" role="alert" aria-live="polite">
            {formError}
          </p>

          <button
            type="submit"
            className={`ink-button ink-button--primary ${verifying ? 'ink-button--loading' : ''}`.trim()}
            disabled={verifying}
          >
            {verifying ? 'Verifying…' : 'Verify account'}
          </button>
        </form>

        <div className="ink-spacer" />

        <p className="ink-footer-note">
          Wrong address?{' '}
          <button
            type="button"
            className="ink-link ink-link-button"
            onClick={() => {
              setPendingVerification(null);
              setVerificationNotice('');
              setOtpCode('');
              setFormError('');
            }}
          >
            Use a different email
          </button>
        </p>
      </InkAuthShell>
    );
  }

  return (
    <InkAuthShell hero={HERO} lead={LEAD} variant="signup" aside={asideCard}>
      <div className="ink-auth__mobile-top-row">
        <Link className="ink-back-button" to="/login" aria-label="Back to sign in">
          ←
        </Link>
        <div className="ink-progress ink-progress--fluid">
          <div className="ink-progress__bars">
            <span className="ink-progress__bar" data-active="true" />
            <span className="ink-progress__bar" />
          </div>
          <span className="ink-progress__label">1 of 2</span>
        </div>
      </div>

      <div className="ink-heading ink-heading--signup">
        <h1>Create your account</h1>
        <div className="ink-progress ink-hide-mobile">
          <div className="ink-progress__bars">
            <span className="ink-progress__bar" data-active="true" />
            <span className="ink-progress__bar" />
          </div>
          <p className="ink-progress__label">Step 1 of 2 — your details</p>
        </div>
        <p className="ink-show-mobile-only">You&apos;ll add your vehicle next.</p>
      </div>

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
            onBlur={handleBlur}
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
            onBlur={handleBlur}
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
          onBlur={handleBlur}
          error={fieldErrors.email}
        />

        <div className="ink-password-block">
          <InkPasswordField
            inputRef={fieldRefs.password}
            name="password"
            autoComplete="new-password"
            value={form.password}
            onChange={updateField}
            onBlur={handleBlur}
            error={fieldErrors.password}
          />
          {/* The requirement rides with the meter now, so the field no longer
              renders it separately — it was appearing twice over otherwise. */}
          <div className="ink-hide-mobile">
            <InkStrengthMeter score={strength} hint={PASSWORD_HELP} />
          </div>
        </div>

        <div className="ink-spacer ink-show-mobile-only" />

        <label className="ink-check">
          <input
            type="checkbox"
            name="agreedToTerms"
            aria-label="I agree to the Terms of Service and Privacy Policy"
            checked={form.agreedToTerms}
            onChange={updateField}
          />
          <span className="ink-check__label ink-check__label--small">
            I agree to the{' '}
            <a className="ink-link" href="/terms">
              Terms of Service
            </a>{' '}
            and{' '}
            <a className="ink-link" href="/privacy">
              Privacy Policy
            </a>
            .
          </span>
        </label>

        <p className="ink-form-error" role="alert" aria-live="polite">
          {formError}
        </p>

        <button
          type="submit"
          className={`ink-button ink-button--primary ${submitting ? 'ink-button--loading' : ''}`.trim()}
          disabled={submitting}
        >
          {submitting ? 'Creating account…' : 'Continue'}
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
