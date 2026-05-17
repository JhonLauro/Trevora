import { Link } from 'react-router-dom';
import React, { useState } from 'react';
import { loginUser } from '../api/auth.js';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
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
      window.location.assign(user.role === 'MECHANIC' ? '/mechanic' : '/vehicles');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell auth-page">
      <section className="auth-card">
        <p className="eyebrow">Module 4 Auth</p>
        <h1>Login</h1>
        <p className="muted">Sign in as a vehicle owner or mechanic.</p>

        {error && <div className="alert">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input name="email" type="email" value={form.email} onChange={updateField} required />
          </label>
          <label>
            Password
            <input name="password" type="password" value={form.password} onChange={updateField} required />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="auth-helper">
          New to Trevora? <Link to="/register">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
