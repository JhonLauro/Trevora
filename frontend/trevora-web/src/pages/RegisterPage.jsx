import { Link } from 'react-router-dom';
import React, { useState } from 'react';
import { registerUser } from '../api/auth.js';
import AuthLayout from '../components/AuthLayout.jsx';

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'VEHICLE_OWNER',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setVerificationNotice('');

    try {
      const user = await registerUser(form);
      window.location.assign(user.role === 'MECHANIC' ? '/mechanic' : '/vehicles');
    } catch (err) {
      if (err.code === 'EMAIL_VERIFICATION_REQUIRED') {
        setVerificationNotice(err.message);
        return;
      }
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
        {verificationNotice && (
          <div className="auth-status-notice" role="status">
            <span className="auth-status-icon">✓</span>
            <span>{verificationNotice}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-name-grid">
            <label>
              First name
              <input name="firstName" value={form.firstName} onChange={updateField} required />
            </label>
            <label>
              Last name
              <input name="lastName" value={form.lastName} onChange={updateField} required />
            </label>
          </div>
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
