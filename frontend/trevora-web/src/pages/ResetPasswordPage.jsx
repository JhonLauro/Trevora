import { Link, useNavigate } from 'react-router-dom';
import React, { useEffect, useRef, useState } from 'react';
import { beginPasswordRecovery, completePasswordReset } from '../api/auth.js';
import InkAuthShell from '../components/InkAuthShell.jsx';
import {
  InkPasswordField,
  InkStrengthMeter,
  passwordStrength,
} from '../components/InkFormControls.jsx';

const PASSWORD_HELP = 'At least 8 characters, with a number.';

const HERO = 'Set a new password.';
const LEAD = 'Choose something you can remember. You only need it when you sign in on a new device.';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const [linkState, setLinkState] = useState('checking');
  const [linkError, setLinkError] = useState('');
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const strength = passwordStrength(form.password);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const ready = await beginPasswordRecovery();
        if (cancelled) return;
        setLinkState(ready ? 'ready' : 'invalid');
        if (!ready) {
          setLinkError('This reset link is no longer valid. Request a new one to continue.');
        }
      } catch (err) {
        if (cancelled) return;
        setLinkState('invalid');
        setLinkError(err.message || 'This reset link is no longer valid.');
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  function validateField(name, value, current = form) {
    switch (name) {
      case 'password':
        if (!value) return 'Choose a password.';
        if (value.length < 8) return 'Use at least 8 characters.';
        if (!/\d/.test(value)) return 'Include at least one number.';
        return '';
      case 'confirmPassword':
        if (!value) return 'Type the password once more.';
        return value === current.password ? '' : "Those two passwords don't match.";
      default:
        return '';
    }
  }

  function updateField(event) {
    const { name, value } = event.target;
    const next = { ...form, [name]: value };
    setForm(next);
    setFormError('');
    if (fieldErrors[name]) {
      setFieldErrors((current) => ({ ...current, [name]: validateField(name, value, next) }));
    }
  }

  function handleBlur(event) {
    const { name, value } = event.target;
    setFieldErrors((current) => ({ ...current, [name]: validateField(name, value) }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = {
      password: validateField('password', form.password),
      confirmPassword: validateField('confirmPassword', form.confirmPassword),
    };
    setFieldErrors(errors);

    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }
    if (errors.confirmPassword) {
      confirmRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      await completePasswordReset(form.password);
      navigate('/login', {
        replace: true,
        state: { notice: 'Your password has been updated. Sign in with your new password.' },
      });
    } catch (err) {
      setFormError(err.message || 'We could not update your password. Please try again.');
      setSubmitting(false);
    }
  }

  if (linkState === 'checking') {
    return (
      <InkAuthShell hero={HERO} lead={LEAD} mobileTitle="One moment">
        <div className="ink-heading">
          <h1 className="ink-hide-mobile">Checking your link…</h1>
          <p>This only takes a second.</p>
        </div>
      </InkAuthShell>
    );
  }

  if (linkState === 'invalid') {
    return (
      <InkAuthShell hero={HERO} lead={LEAD} mobileTitle="Link expired">
        <div className="ink-heading">
          <h1 className="ink-hide-mobile">That link has expired</h1>
          <p>{linkError}</p>
        </div>

        <Link className="ink-button ink-button--primary" to="/forgot-password">
          Request a new link
        </Link>

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
    <InkAuthShell hero={HERO} lead={LEAD} mobileTitle="New password">
      <div className="ink-heading">
        <h1 className="ink-hide-mobile">Set a new password</h1>
        <p>Choose a password you haven&apos;t used here before.</p>
      </div>

      <form className="ink-form" onSubmit={handleSubmit} noValidate>
        <div className="ink-password-block">
          <InkPasswordField
            inputRef={passwordRef}
            label="New password"
            name="password"
            autoComplete="new-password"
            value={form.password}
            onChange={updateField}
            onBlur={handleBlur}
            error={fieldErrors.password}
            help={PASSWORD_HELP}
          />
          {form.password && <InkStrengthMeter score={strength} />}
        </div>

        <InkPasswordField
          inputRef={confirmRef}
          label="Confirm new password"
          name="confirmPassword"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={updateField}
          onBlur={handleBlur}
          error={fieldErrors.confirmPassword}
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
          {submitting ? 'Updating password…' : 'Update password'}
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
