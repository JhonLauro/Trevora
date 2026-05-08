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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
      payload.fullName = payload.fullName.trim();
      payload.email = payload.email.trim();
      payload.phoneNumber = payload.phoneNumber.trim();
      await register(payload);
      navigate('/dashboard');
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
      <Link to="/" className="back-home-btn">Back to Home</Link>

      <div className="auth-left">
        <div className="auth-left-content">
          <h1>Join<br /><span>Trevora</span></h1>
          <p>Create your account and start shaping the travel platform around real users.</p>
          <div className="auth-left-features">
            <div className="auth-left-feature">Traveler profiles</div>
            <div className="auth-left-feature">Supabase-backed accounts</div>
            <div className="auth-left-feature">Spring Boot API foundation</div>
          </div>
        </div>
      </div>

      <div className="auth-divider">
        <div className="auth-divider-line" />
        <div className="auth-divider-icon">T</div>
        <div className="auth-divider-line" />
      </div>

      <div className="auth-right">
        <div className="auth-form-box auth-form-box--wide">
          <p className="auth-brand">Trevora</p>
          <h2 className="auth-title">Create Account</h2>
          <p className="auth-subtitle">Fill in the details below to register</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input id="fullName" name="fullName" type="text" autoComplete="name" value={form.fullName} onChange={handleChange} className={fieldErrors.fullName ? 'input-error' : ''} placeholder="e.g. Maria Santos" />
              {fieldErrors.fullName && <span className="field-error">{fieldErrors.fullName}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} className={fieldErrors.email ? 'input-error' : ''} placeholder="you@email.com" />
              {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="phoneNumber">Phone Number</label>
              <input id="phoneNumber" name="phoneNumber" type="tel" autoComplete="tel" value={form.phoneNumber} onChange={handleChange} className={fieldErrors.phoneNumber ? 'input-error' : ''} placeholder="+63 912 345 6789" />
              {fieldErrors.phoneNumber && <span className="field-error">{fieldErrors.phoneNumber}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={handleChange} className={fieldErrors.password ? 'input-error' : ''} placeholder="Min. 8 characters" />
                <button type="button" className="toggle-pw" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className="input-wrapper">
                <input id="confirmPassword" name="confirmPassword" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={handleChange} className={fieldErrors.confirmPassword ? 'input-error' : ''} placeholder="Repeat password" />
                <button type="button" className="toggle-pw" onClick={() => setShowConfirm((value) => !value)} aria-label={showConfirm ? 'Hide password' : 'Show password'}>{showConfirm ? 'Hide' : 'Show'}</button>
              </div>
              {fieldErrors.confirmPassword && <span className="field-error">{fieldErrors.confirmPassword}</span>}
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create Account'}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>

          <Snackbar open={!!apiError} message={apiError} type="error" onClose={() => setApiError('')} />
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
