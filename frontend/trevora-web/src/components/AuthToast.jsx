import React from 'react';

export default function AuthToast({ message, type = 'error' }) {
  if (!message) return null;

  return (
    <div className={`auth-toast auth-toast-${type}`} role="status" aria-live="polite">
      <span>{type === 'success' ? '✓' : '!'}</span>
      <p>{message}</p>
    </div>
  );
}
