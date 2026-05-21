import { Link } from 'react-router-dom';
import React, { useState } from 'react';
import { registerUser } from '../api/auth.js';
import AuthLayout from '../components/AuthLayout.jsx';
import AuthToast from '../components/AuthToast.jsx';

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
  const [error, setError] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const [toast, setToast] = useState(null);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
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
    setToast(null);

    try {
      const user = await registerUser(payload);
      setToast({ type: 'success', message: 'Account created successfully.' });
      window.location.assign(user.role === 'ADMIN' ? '/dashboard' : '/vehicles');
    } catch (err) {
      if (err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        setVerificationNotice(err.message);
        setToast({ type: 'success', message: err.message });
        return;
      }
      setError(err.message);
      setToast({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
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
            <span className="auth-status-icon">✓</span>
            <span>{verificationNotice}</span>
          </div>
        )}

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
