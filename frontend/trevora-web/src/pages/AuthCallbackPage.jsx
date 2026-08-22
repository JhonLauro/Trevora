import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { completeOAuthSignIn } from '../api/auth.js';
import { getVehicles } from '../api/vehicles.js';
import InkAuthShell from '../components/InkAuthShell.jsx';

/**
 * Never block a successful sign-in on this check — if the vehicle lookup
 * fails, fall through to the normal destination.
 */
async function hasNoVehicle() {
  try {
    const vehicles = await getVehicles();
    return Array.isArray(vehicles) && vehicles.length === 0;
  } catch {
    return false;
  }
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function finishSignIn() {
      try {
        const user = await completeOAuthSignIn();
        if (cancelled) return;

        if (user.role === 'ADMIN') {
          navigate('/dashboard', { replace: true });
          return;
        }

        // Google sign-in has no step 1/step 2 of its own, so a first-time
        // Google user would otherwise skip the vehicle step entirely. Send
        // anyone without a vehicle into step 2 — this also picks up owners
        // who abandoned it earlier.
        navigate(await hasNoVehicle() ? '/register/vehicle' : '/vehicles', { replace: true });
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
    <InkAuthShell
      hero="Every repair receipt, in one place."
      lead="Photograph the receipt, check the details, and it's filed against your vehicle for good."
      variant="signin"
    >
      <div className="ink-heading">
        <h1>{error ? 'Sign-in didn’t finish' : 'Signing you in…'}</h1>
        <p>{error || 'Please wait while we finish connecting your Google account.'}</p>
      </div>

      {error && (
        <p className="ink-footer-note">
          <Link className="ink-link" to="/login">
            Return to sign in
          </Link>
        </p>
      )}
    </InkAuthShell>
  );
}
