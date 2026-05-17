import React from 'react';

const authFeatures = [
  ['▤', 'Capture service records', 'Receipt, voice, or manual entry'],
  ['✓', 'Validate & organize', 'AI-assisted draft review'],
  ['◇', 'Share securely', 'Temporary mechanic access via QR'],
];

export default function AuthLayout({ children }) {
  return (
    <main className="auth-split-page">
      <section className="auth-brand-panel">
        <div className="auth-brand-mark">
          <span className="brand-icon">⌁</span>
          <strong>Trevora</strong>
        </div>

        <div className="auth-brand-copy">
          <h1>Vehicle service history made clear.</h1>
          <p>Capture, validate, and organize all your vehicle maintenance records in one trusted place.</p>
        </div>

        <div className="auth-feature-list">
          {authFeatures.map(([icon, title, description]) => (
            <div className="auth-feature" key={title}>
              <span>{icon}</span>
              <div>
                <strong>{title}</strong>
                <small>{description}</small>
              </div>
            </div>
          ))}
        </div>

        <small className="auth-copyright">© 2026 Trevora. All rights reserved.</small>
      </section>

      <section className="auth-form-panel">{children}</section>
    </main>
  );
}
