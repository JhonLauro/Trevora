import { useEffect, useRef } from 'react';

/** What a mechanic sees when their time is up. States no duration on purpose:
 *  that number lives in `SharingPolicy`, and a copy here would drift. */
export const ACCESS_ENDED_MESSAGE =
  'Your access to this vehicle has ended. Ask the owner for a new code if you need to keep reading.';

/**
 * Ends a mechanic's page at the moment their session does.
 *
 * <p>The server already refuses every request once a session's expiry passes,
 * so access was always revoked there. What it could not do is reach a page that
 * was already open: the records it had loaded stayed on screen past the
 * deadline until the mechanic happened to reload or search. This calls `onEnd`
 * at `expiresAt` -- or straight away if that has already gone -- so the screen
 * ends when the access does.
 *
 * <p>Revoking early from the owner's side is not seen here until the page's
 * next request; that needs the server to tell the page, which this does not do.
 */
export default function useAccessDeadline(expiresAt, onEnd) {
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    if (!expiresAt) return undefined;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(remaining)) return undefined;
    if (remaining <= 0) {
      onEndRef.current();
      return undefined;
    }
    // setTimeout overflows past about 24.8 days; a session is hours.
    const timer = window.setTimeout(() => onEndRef.current(), Math.min(remaining, 2147483647));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
}
