import { Link } from 'react-router-dom';
import React, { useState } from 'react';
import { registerUser, signInWithGoogle, verifyRegistrationOtp } from '../api/auth.js';
import AuthLayout from '../components/AuthLayout.jsx';
import AuthToast from '../components/AuthToast.jsx';
import GoogleIcon from '../components/GoogleIcon.jsx';

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'VEHICLE_OWNER',
  });
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const [pendingVerification, setPendingVerification] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [toast, setToast] = useState(null);

  async function handleGoogleSignIn() {
    setError('');
    setToast(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Unable to start Google sign-in.');
      setToast({ type: 'error', message: err.message || 'Unable to start Google sign-in.' });
      setGoogleLoading(false);
    }
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
    setToast(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
    };

    const validationMessage = validateRegisterForm(payload);
    if (validationMessage) {
      setError(validationMessage);
      setVerificationNotice('');
      setToast({ type: 'error', message: validationMessage });
      return;
    }

    setSaving(true);
    setError('');
    setVerificationNotice('');
    setPendingVerification(null);
    setOtpCode('');
    setToast(null);

    try {
      const result = await registerUser(payload);
      if (result.requiresVerification) {
        setPendingVerification({ ...payload, otpType: result.otpType });
        setVerificationNotice(`${result.message} Enter the code sent to ${payload.email}.`);
        setToast({ type: 'success', message: result.message });
        return;
      }
    } catch (err) {
      if (err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        setPendingVerification(payload);
        setVerificationNotice(`Enter the verification code sent to ${payload.email}.`);
        setToast({ type: 'success', message: 'Verification code sent.' });
        return;
      }
      setError(err.message);
      setToast({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleVerifyAccount(event) {
    event.preventDefault();
    const token = otpCode.trim().replace(/\s+/g, '');

    if (!pendingVerification) {
      setError('Create an account first before entering a verification code.');
      return;
    }

    if (!token) {
      setError('Enter the verification code from your email.');
      return;
    }

    setVerifying(true);
    setError('');
    setToast(null);

    try {
      const user = await verifyRegistrationOtp({
        ...pendingVerification,
        token,
      });
      setToast({ type: 'success', message: 'Account verified successfully.' });
      window.location.assign(user.role === 'ADMIN' ? '/dashboard' : '/vehicles');
    } catch (err) {
      setError(err.message || 'Unable to verify this code. Please try again.');
      setToast({ type: 'error', message: err.message || 'Unable to verify this code. Please try again.' });
    } finally {
      setVerifying(false);
    }
  }

  function resetVerification() {
    setPendingVerification(null);
    setVerificationNotice('');
    setOtpCode('');
    setError('');
    setToast(null);
  }

  if (pendingVerification) {
    return (
      <AuthLayout>
        <AuthToast message={toast?.message} type={toast?.type} />
        <section className="auth-card">
          <p className="eyebrow">Verify account</p>
          <h1>Enter your email code</h1>
          <p className="muted">Complete verification before signing in to Trevora.</p>

          {error && <div className="alert">{error}</div>}
          {verificationNotice && (
            <div className="auth-status-notice" role="status">
              <span className="auth-status-icon">i</span>
              <span>{verificationNotice}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleVerifyAccount} noValidate>
            <div className="auth-otp-panel">
              <label>
                Verification code
                <input
                  className="auth-otp-input"
                  name="otpCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otpCode}
                  onChange={(event) => {
                    setOtpCode(event.target.value);
                    setError('');
                  }}
                  placeholder="Enter email code"
                  required
                />
              </label>
              <p>Use the code from the email Supabase sent after account creation.</p>
            </div>
            <button type="submit" disabled={verifying}>
              {verifying ? 'Verifying account...' : 'Verify account'}
            </button>
            <button className="auth-text-button" type="button" onClick={resetVerification} disabled={verifying}>
              Use a different email
            </button>
          </form>

          <p className="auth-helper">
            Already verified? <Link to="/login">Sign in</Link>
          </p>
        </section>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthToast message={toast?.message} type={toast?.type} />
      <section className="auth-card">
        <h1>Create account</h1>
        <p className="muted">Start organizing your vehicle service history.</p>

        {error && <div className="alert">{error}</div>}
        {verificationNotice && (
          <div className="auth-status-notice" role="status">
            <span className="auth-status-icon">i</span>
            <span>{verificationNotice}</span>
          </div>
        )}

        <button
          type="button"
          className="auth-oauth-button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || saving}
        >
          <GoogleIcon />
          {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-name-grid">
            <label>
              First name
              <input
                name="firstName"
                value={form.firstName}
                onChange={updateField}
                placeholder="Enter first name"
                required
              />
            </label>
            <label>
              Last name
              <input
                name="lastName"
                value={form.lastName}
                onChange={updateField}
                placeholder="Enter last name"
                required
              />
            </label>
          </div>
          <label>
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              placeholder="Enter email address"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength="8"
              value={form.password}
              onChange={updateField}
              placeholder="Enter password"
              required
            />
          </label>
          <label>
            Confirm password
            <input
              name="confirmPassword"
              type="password"
              minLength="8"
              value={form.confirmPassword}
              onChange={updateField}
              placeholder="Confirm password"
              required
            />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="auth-helper">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </AuthLayout>
  );
}

function validateRegisterForm(form) {
  if (!form.firstName || !form.lastName || !form.email || !form.password || !form.confirmPassword) {
    return 'Complete all fields to create your account.';
  }

  if (!isValidEmail(form.email)) {
    return 'Enter a valid email address.';
  }

  if (form.password.length < 8) {
    return 'Password must be at least 8 characters.';
  }

  if (form.password !== form.confirmPassword) {
    return 'Passwords do not match.';
  }

  return '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
