import { Link, useLocation, useNavigate } from 'react-router-dom';
import React, { useRef, useState } from 'react';
import { loginUser, signInWithGoogle } from '../api/auth.js';
import InkAuthShell from '../components/InkAuthShell.jsx';
import { InkDivider, InkField, InkGoogleButton, InkPasswordField } from '../components/InkFormControls.jsx';

const STEPS = ['Snap or upload the receipt', 'Check what was read from it', 'Share it when you sell'];

const EMAIL_ERROR = "That address doesn't look right — check the spelling.";
const CREDENTIALS_ERROR = "That email and password don't match. Try again or reset your password.";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const notice = location.state?.notice || '';
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [form, setForm] = useState({ email: '', password: '', keepSignedIn: true });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  function validateField(name, value) {
    if (name === 'email') {
      if (!value.trim()) return 'Enter the email address you signed up with.';
      if (!isValidEmail(value.trim())) return EMAIL_ERROR;
    }
    if (name === 'password' && !value) return 'Enter your password.';
    return '';
  }

  function updateField(event) {
    const { name, type, checked, value } = event.target;
    const nextValue = type === 'checkbox' ? checked : value;
    setForm((current) => ({ ...current, [name]: nextValue }));
    setFormError('');
    // Re-validate on change only once the field has already errored.
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
    const errors = {
      email: validateField('email', form.email),
      password: validateField('password', form.password),
    };
    setFieldErrors(errors);

    if (errors.email || errors.password) {
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      await loginUser({ email: form.email.trim(), password: form.password, remember: form.keepSignedIn });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setFormError(err.message || CREDENTIALS_ERROR);
      setSubmitting(false);
    }
  }

  return (
    <InkAuthShell
      hero="Every repair receipt, in one place."
      lead="Photograph the receipt, check the details, and it's filed against your vehicle for good."
      mobileTitle="Welcome back."
      variant="signin"
      aside={
        <ol className="ink-steps">
          {STEPS.map((step, index) => (
            <li key={step}>
              <span className="ink-steps__number">{index + 1}</span>
              <span className="ink-steps__label">{step}</span>
            </li>
          ))}
        </ol>
      }
    >
      <div className="ink-heading ink-hide-mobile">
        <h1>Sign in</h1>
        <p>Welcome back.</p>
      </div>

      {notice && (
        <p className="ink-notice" role="status" aria-live="polite">
          {notice}
        </p>
      )}

      <form className="ink-form ink-form--signin" onSubmit={handleSubmit} noValidate>
        <InkGoogleButton loading={googleLoading} disabled={submitting} onClick={handleGoogleSignIn} />

        <InkDivider />

        <InkField
          className="ink-field--email"
          inputRef={emailRef}
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

        <InkPasswordField
          inputRef={passwordRef}
          name="password"
          autoComplete="current-password"
          value={form.password}
          onChange={updateField}
          onBlur={handleBlur}
          error={fieldErrors.password}
        />

        <Link className="ink-link ink-inline-link" to="/forgot-password">
          Forgot your password?
        </Link>

        <label className="ink-check ink-hide-mobile">
          <input
            type="checkbox"
            name="keepSignedIn"
            aria-label="Keep me signed in"
            checked={form.keepSignedIn}
            onChange={updateField}
          />
          <span className="ink-check__label">Keep me signed in</span>
        </label>

        <p className="ink-form-error" role="alert" aria-live="polite">
          {formError}
        </p>

        <button
          type="submit"
          className={`ink-button ink-button--primary ${submitting ? 'ink-button--loading' : ''}`.trim()}
          disabled={submitting}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="ink-spacer" />

      <p className="ink-footer-note">
        No account yet?{' '}
        <Link className="ink-link" to="/register">
          Create one
        </Link>
      </p>
    </InkAuthShell>
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
