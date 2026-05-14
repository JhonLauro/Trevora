import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Snackbar from '../../components/Snackbar';
import { useAuth } from '../../context/AuthContext';
import './AuthPages.css';

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePhone = (phone) => /^\+?[\d\s\-().]{7,20}$/.test(phone);

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  });
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
    if (!form.fullName.trim()) errors.fullName = 'Full name is required.';
    else if (form.fullName.trim().length < 2) errors.fullName = 'Full name must be at least 2 characters.';
    if (!form.email.trim()) errors.email = 'Email is required.';
    else if (!validateEmail(form.email)) errors.email = 'Please enter a valid email address.';
    if (!form.phoneNumber.trim()) errors.phoneNumber = 'Phone number is required.';
    else if (!validatePhone(form.phoneNumber)) errors.phoneNumber = 'Please enter a valid phone number.';
    if (!form.password) errors.password = 'Password is required.';
    else if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (!form.confirmPassword) errors.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
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
      const { confirmPassword, ...payload } = form;
      await register({
        ...payload,
        fullName: payload.fullName.trim(),
        email: payload.email.trim(),
        phoneNumber: payload.phoneNumber.trim(),
      });
      navigate('/login');
    } catch (err) {
      const message = err.message || 'Registration failed. Please try again.';
      if (message === 'Email already exists.' || message.toLowerCase().includes('email already')) {
        setFieldErrors((prev) => ({
          ...prev,
          email: 'This email is already registered. Use another email or sign in.',
        }));
      } else {
        setApiError(message);
      }
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
          <h1>Start your vehicle service record.</h1>
          <p>Create an owner account for organizing maintenance records under the correct vehicle profile.</p>
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
            <small>Review records before saving</small>
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
        <div className="auth-form-box auth-form-box--wide">
          <h2 className="auth-title">Create account</h2>
          <p className="auth-subtitle">Set up your owner account to continue</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" name="fullName" type="text" autoComplete="name" value={form.fullName} onChange={handleChange} className={fieldErrors.fullName ? 'input-error' : ''} placeholder="Juan dela Cruz" />
              {fieldErrors.fullName && <span className="field-error">{fieldErrors.fullName}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} className={fieldErrors.email ? 'input-error' : ''} placeholder="owner@trevora.app" />
              {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="phoneNumber">Phone number</label>
              <input id="phoneNumber" name="phoneNumber" type="tel" autoComplete="tel" value={form.phoneNumber} onChange={handleChange} className={fieldErrors.phoneNumber ? 'input-error' : ''} placeholder="+63 917 123 4567" />
              {fieldErrors.phoneNumber && <span className="field-error">{fieldErrors.phoneNumber}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={handleChange} className={fieldErrors.password ? 'input-error' : ''} placeholder="Minimum 8 characters" />
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={handleChange} className={fieldErrors.confirmPassword ? 'input-error' : ''} placeholder="Repeat password" />
              {fieldErrors.confirmPassword && <span className="field-error">{fieldErrors.confirmPassword}</span>}
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>

          <Snackbar open={!!apiError} message={apiError} type="error" onClose={() => setApiError('')} />
        </div>
      </section>
    </div>
  );
};

export default RegisterPage;
