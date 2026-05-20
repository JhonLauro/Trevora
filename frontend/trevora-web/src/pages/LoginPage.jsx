import { Link } from 'react-router-dom';
import React, { useState } from 'react';
import { loginUser } from '../api/auth.js';
import AuthLayout from '../components/AuthLayout.jsx';

export default function LoginPage() {
  const [form, setForm] = useState({ email: 'owner@trevora.app', password: 'password123' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const user = await loginUser(form);
      window.location.assign(user.role === 'ADMIN' ? '/dashboard' : '/vehicles');
    } catch (err) {
      setError(err.message);
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

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input name="email" type="email" value={form.email} onChange={updateField} required />
          </label>
          <label>
            <span className="auth-label-row">
              Password
              <Link to="/login">Forgot password?</Link>
            </span>
            <input name="password" type="password" value={form.password} onChange={updateField} required />
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
      <p className="auth-demo-note">Demo credentials pre-filled • Click Sign in to explore</p>
    </AuthLayout>
  );
}
