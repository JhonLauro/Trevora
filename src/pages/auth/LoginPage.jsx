import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Snackbar from '../../components/Snackbar';
import { useAuth } from '../../context/AuthContext';
import './AuthPages.css';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ identifier: 'owner@trevora.app', password: 'password' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    setApiError('');
  };

  const validate = () => {
    const errors = {};
    if (!form.identifier.trim()) errors.identifier = 'Email is required.';
    if (!form.password) errors.password = 'Password is required.';
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      await login(form.identifier.trim(), form.password);
      navigate('/');
    } catch (err) {
      setApiError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-left">
        <Link to="/" className="auth-logo">
          <span>▰</span>
          <strong>Trevora</strong>
        </Link>

        <div className="auth-left-content">
          <h1>Vehicle service history made clear.</h1>
          <p>Capture, validate, and organize all your vehicle maintenance records in one trusted place.</p>
        </div>

        <div className="auth-feature-list">
          <div>
            <span>▤</span>
            <strong>Capture service records</strong>
            <small>Receipt, voice, or manual entry</small>
          </div>
          <div>
            <span>✓</span>
            <strong>Validate & organize</strong>
            <small>AI-assisted draft review</small>
          </div>
          <div>
            <span>◇</span>
            <strong>Share securely</strong>
            <small>Temporary mechanic access via QR</small>
          </div>
        </div>

        <p className="auth-footer">© 2026 Trevora. All rights reserved.</p>
      </section>

      <section className="auth-right">
        <div className="auth-form-box">
          <h2 className="auth-title">Welcome back</h2>
          <p className="auth-subtitle">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="identifier">Email address</label>
              <input
                id="identifier"
                name="identifier"
                type="email"
                autoComplete="username"
                value={form.identifier}
                onChange={handleChange}
                className={fieldErrors.identifier ? 'input-error' : ''}
              />
              {fieldErrors.identifier && <span className="field-error">{fieldErrors.identifier}</span>}
            </div>

            <div className="form-group">
              <div className="label-row">
                <label htmlFor="password">Password</label>
                <button type="button">Forgot password?</button>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange}
                className={fieldErrors.password ? 'input-error' : ''}
              />
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
            </div>

            <label className="remember-row">
              <input type="checkbox" />
              <span>Remember me for 30 days</span>
            </label>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Sign in'}
            </button>
          </form>

          <p className="auth-switch">
            Don't have an account? <Link to="/register">Create account</Link>
          </p>

          <Snackbar open={!!apiError} message={apiError} type="error" onClose={() => setApiError('')} />
        </div>
        <p className="demo-note">Demo credentials pre-filled • Click Sign in to explore</p>
      </section>
    </div>
  );
};

export default LoginPage;
