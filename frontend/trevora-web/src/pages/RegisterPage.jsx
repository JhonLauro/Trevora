import { Link } from 'react-router-dom';
import React, { useState } from 'react';
import { registerUser } from '../api/auth.js';
import AuthLayout from '../components/AuthLayout.jsx';

export default function RegisterPage() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'VEHICLE_OWNER',
  });
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
      const user = await registerUser(form);
      window.location.assign(user.role === 'MECHANIC' ? '/mechanic' : '/vehicles');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthLayout>
      <section className="auth-card">
        <h1>Create account</h1>
        <p className="muted">Start organizing your vehicle service history.</p>

        {error && <div className="alert">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Full name
            <input name="fullName" value={form.fullName} onChange={updateField} required />
          </label>
          <label>
            Email
            <input name="email" type="email" value={form.email} onChange={updateField} required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength="8"
              value={form.password}
              onChange={updateField}
              required
            />
          </label>
          <label>
            Role
            <select name="role" value={form.role} onChange={updateField}>
              <option value="VEHICLE_OWNER">Vehicle Owner</option>
              <option value="MECHANIC">Mechanic</option>
            </select>
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
