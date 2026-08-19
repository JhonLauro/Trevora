import { Link, useNavigate } from 'react-router-dom';
import React, { useState } from 'react';
import { loginUser, signInWithGoogle } from '../api/auth.js';
import AuthLayout from '../components/AuthLayout.jsx';
import GoogleIcon from '../components/GoogleIcon.jsx';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [saving, setSaving] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogleSignIn() {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Unable to start Google sign-in.');
      setGoogleLoading(false);
    }
  }

  function updateField(event) {
    const { name, type, checked, value } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const email = form.email.trim();
    const password = form.password;

    if (!email || !password) {
      const message = 'Enter your email address and password to sign in.';
      setError(message);
      return;
    }

    if (!isValidEmail(email)) {
      const message = 'Enter a valid email address.';
      setError(message);
      return;
    }

    setSaving(true);
    setError('');

    try {
      await loginUser({ email, password, remember: form.remember });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = err.message || 'Unable to sign in. Please try again.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthLayout>
      <section className="auth-card">
        <h1>Welcome back</h1>
        <p className="muted">Sign in to your account to continue</p>

        {error && <div className="alert">{error}</div>}

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
            <input name="remember" type="checkbox" checked={form.remember} onChange={updateField} />
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
