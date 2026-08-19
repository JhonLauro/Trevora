import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeOAuthSignIn } from '../api/auth.js';
import AuthLayout from '../components/AuthLayout.jsx';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function finishSignIn() {
      try {
        const user = await completeOAuthSignIn();
        if (!cancelled) {
          navigate(user.role === 'ADMIN' ? '/dashboard' : '/vehicles', { replace: true });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Unable to complete Google sign-in. Please try again.');
        }
      }
    }

    finishSignIn();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <AuthLayout>
      <section className="auth-card">
        <h1>Signing you in...</h1>
        {error ? (
          <>
            <div className="alert">{error}</div>
            <p className="auth-helper">
              <a href="/login">Return to sign in</a>
            </p>
          </>
        ) : (
          <p className="muted">Please wait while we finish connecting your Google account.</p>
        )}
      </section>
    </AuthLayout>
  );
}
