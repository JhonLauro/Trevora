import { Link, useNavigate } from 'react-router-dom';
import React, { useState } from 'react';
import { loginUser } from '../api/auth.js';
import AuthLayout from '../components/AuthLayout.jsx';
import AuthToast from '../components/AuthToast.jsx';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setToast(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const email = form.email.trim();
    const password = form.password;

    if (!email || !password) {
      const message = 'Enter your email address and password to sign in.';
      setError(message);
      setToast({ type: 'error', message });
      return;
    }

    if (!isValidEmail(email)) {
      const message = 'Enter a valid email address.';
      setError(message);
      setToast({ type: 'error', message });
      return;
    }

    setSaving(true);
    setError('');
    setToast(null);

    try {
      await loginUser({ email, password });
      setToast({ type: 'success', message: 'Signed in successfully.' });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = err.message || 'Unable to sign in. Please try again.';
      setError(message);
      setToast({ type: 'error', message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthLayout>
      <AuthToast message={toast?.message} type={toast?.type} />
      <section className="auth-card">
        <h1>Welcome back</h1>
        <p className="muted">Sign in to your account to continue</p>

        {error && <div className="alert">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label>
            Email address
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
            <span className="auth-label-row">
              Password
              <Link to="/login">Forgot password?</Link>
            </span>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
              placeholder="Enter password"
              required
            />
          </label>
          <label className="auth-checkbox">
            <input type="checkbox" />
            Remember me for 30 days
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="auth-helper">
          Don&apos;t have an account? <Link to="/register">Create account</Link>
        </p>
      </section>
    </AuthLayout>
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
