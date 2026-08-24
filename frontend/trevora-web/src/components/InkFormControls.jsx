import React, { useId, useState } from 'react';
import GoogleIcon from './GoogleIcon.jsx';

export function InkField({ id, label, error, help, className = '', inputRef, children, ...inputProps }) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={`ink-field ${className}`.trim()} data-invalid={error ? 'true' : 'false'}>
      <label className="ink-field__label" htmlFor={fieldId}>
        {label}
      </label>
      <div className={`ink-field__control ${children ? 'ink-field__control--with-toggle' : ''}`.trim()}>
        <input
          id={fieldId}
          ref={inputRef}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? 'true' : undefined}
          {...inputProps}
        />
        {children}
      </div>
      {help && (
        <p className="ink-help" id={helpId}>
          {help}
        </p>
      )}
      {error && (
        <p className="ink-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function InkPasswordField({ label = 'Password', ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <InkField label={label} type={visible ? 'text' : 'password'} {...props}>
      <button
        type="button"
        className="ink-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </InkField>
  );
}

export function InkGoogleButton({ loading, disabled, onClick }) {
  return (
    <button
      type="button"
      className="ink-button ink-button--oauth ink-form__oauth"
      onClick={onClick}
      disabled={loading || disabled}
    >
      <GoogleIcon size={22} />
      {loading ? 'Connecting to Google…' : 'Continue with Google'}
    </button>
  );
}

export function InkDivider({ children = 'or use your email' }) {
  return <div className="ink-divider">{children}</div>;
}

export function passwordStrength(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (password.length >= 12 || /[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

const STRENGTH_WORDS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

/**
 * `hint` puts the password requirement beside the bars rather than above them,
 * which is where the design puts it — the meter and the rule it measures are
 * one statement, not two stacked ones.
 *
 * When a hint is supplied the strength word goes to screen readers only. It is
 * still announced on change; it just stops competing with the requirement for
 * the same 40px of row.
 */
export function InkStrengthMeter({ score, hint }) {
  return (
    <div className="ink-meter">
      <div className="ink-meter__bars" role="presentation">
        {[1, 2, 3, 4].map((bar) => (
          <span key={bar} className="ink-meter__bar" data-filled={score >= bar ? 'true' : 'false'} />
        ))}
      </div>
      <span className={hint ? 'ink-sr-only' : 'ink-meter__word'} aria-live="polite">
        {STRENGTH_WORDS[score]}
      </span>
      {hint && <span className="ink-meter__hint">{hint}</span>}
    </div>
  );
}
