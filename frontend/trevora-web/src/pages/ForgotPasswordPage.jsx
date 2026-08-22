import { Link } from 'react-router-dom';
import React, { useRef, useState } from 'react';
import { requestPasswordReset } from '../api/auth.js';
import InkAuthShell from '../components/InkAuthShell.jsx';
import { InkField } from '../components/InkFormControls.jsx';

const EMAIL_ERROR = "That address doesn't look right — check the spelling.";

const HERO = 'Locked out of your file?';
const LEAD = "It happens. Give us the email you signed up with and we'll send you a link to set a new password.";

export default function ForgotPasswordPage() {
  const emailRef = useRef(null);
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  function validate(value) {
    if (!value.trim()) return 'Enter the email address you signed up with.';
    return isValidEmail(value.trim()) ? '' : EMAIL_ERROR;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const error = validate(email);
    setFieldError(error);
    if (error) {
      emailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setFormError(err.message || 'We could not send that email. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <InkAuthShell hero={HERO} lead={LEAD} mobileTitle="Check your email">
        <div className="ink-heading">
          <h1 className="ink-hide-mobile">Check your email</h1>
          <p>
            If an account exists for <strong>{email.trim()}</strong>, we&apos;ve sent a link to set a new
            password. It expires after a short while, so use the most recent email.
          </p>
        </div>

        <p className="ink-notice">
          Nothing arrived after a minute or two? Check your spam folder, then try again with the address
          you signed up with.
        </p>

        <button
          className="ink-button ink-button--oauth"
          type="button"
          onClick={() => {
            setSent(false);
            setFormError('');
          }}
        >
          Use a different email
        </button>

        <div className="ink-spacer" />

        <p className="ink-footer-note">
          Remembered it?{' '}
          <Link className="ink-link" to="/login">
            Sign in
          </Link>
        </p>
      </InkAuthShell>
    );
  }

  return (
    <InkAuthShell hero={HERO} lead={LEAD} mobileTitle="Reset your password">
      <div className="ink-heading">
        {/* The mobile ink header already carries this title. */}
        <h1 className="ink-hide-mobile">Reset your password</h1>
        <p>We&apos;ll email you a link to set a new one.</p>
      </div>

      <form className="ink-form" onSubmit={handleSubmit} noValidate>
        <InkField
          inputRef={emailRef}
          label="Email address"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setFormError('');
            if (fieldError) setFieldError(validate(event.target.value));
          }}
          onBlur={(event) => setFieldError(validate(event.target.value))}
          error={fieldError}
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
          {submitting ? 'Sending link…' : 'Send reset link'}
        </button>
      </form>

      <div className="ink-spacer" />

      <p className="ink-footer-note">
        Remembered it?{' '}
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
