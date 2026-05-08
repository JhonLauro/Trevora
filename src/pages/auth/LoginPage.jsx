import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Snackbar from '../../components/Snackbar';
import { useAuth } from '../../context/AuthContext';
import './AuthPages.css';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ identifier: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      navigate('/dashboard');
    } catch (err) {
      const message = err.message || 'Login failed. Please try again.';
      if (message === 'Invalid credentials.') {
        setFieldErrors({
          identifier: 'Check the email you entered.',
          password: 'Check your password and try again.',
        });
      } else {
        setApiError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <Link to="/" className="back-home-btn">Back to Home</Link>

      <div className="auth-left">
        <div className="auth-left-content">
          <h1>Welcome to<br /><span>Trevora</span></h1>
          <p>Sign in to continue building your travel plans and saved trip workspace.</p>
          <div className="auth-left-features">
            <div className="auth-left-feature">Organized travel planning</div>
            <div className="auth-left-feature">Secure account access</div>
            <div className="auth-left-feature">Ready for Supabase data</div>
          </div>
        </div>
      </div>

      <div className="auth-divider">
        <div className="auth-divider-line" />
        <div className="auth-divider-icon">T</div>
        <div className="auth-divider-line" />
      </div>

      <div className="auth-right">
        <div className="auth-form-box">
          <p className="auth-brand">Trevora</p>
          <h2 className="auth-title">Sign In</h2>
          <p className="auth-subtitle">Enter your credentials to continue</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="identifier">Email Address</label>
              <input
                id="identifier"
                name="identifier"
                type="email"
                autoComplete="username"
                value={form.identifier}
                onChange={handleChange}
                className={fieldErrors.identifier ? 'input-error' : ''}
                placeholder="you@email.com"
              />
              {fieldErrors.identifier && <span className="field-error">{fieldErrors.identifier}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange}
                  className={fieldErrors.password ? 'input-error' : ''}
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  className="toggle-pw"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Sign In'}
            </button>
          </form>

          <p className="auth-switch">
            Don't have an account? <Link to="/register">Create one</Link>
          </p>

          <Snackbar open={!!apiError} message={apiError} type="error" onClose={() => setApiError('')} />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
