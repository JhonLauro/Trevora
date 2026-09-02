import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  approveMechanicAccessRequest,
  denyMechanicAccessRequest,
  forgetPendingMechanicAccessRequests,
  getPendingMechanicAccessRequests,
} from '../api/qrAccess.js';
import {
  LOCAL_NOTIFICATIONS_CHANGED_EVENT,
  getLocalNotifications,
} from '../api/localNotifications.js';
import { isNotificationEnabled } from '../api/notificationPreferences.js';

/**
 * Approve or deny a mechanic's access request without leaving the page.
 *
 * <p>Until now the only way to answer one was to notice the sidebar count,
 * open Notifications, and decide there. The count is only refreshed when the
 * route changes, so an owner sitting on their Garage while a mechanic waits at
 * the counter learned nothing at all.
 *
 * <p><b>Why an auto-dismissing toast is safe here, when usually it is not.</b>
 * Putting a consequential action in something that disappears is normally a
 * bad trade: miss it and the decision is gone. It is acceptable in this one
 * case because the toast is a shortcut, never the only route — every request
 * it shows stays in Notifications until it is answered or expires. Nothing is
 * lost by ignoring it, which is what makes the shortcut fair.
 *
 * <p>Two rules follow from that and are load-bearing rather than polish: the
 * timer pauses while the pointer or keyboard focus is inside a toast, so it
 * cannot vanish as somebody reaches for it; and approving is the slower of the
 * two actions to reach, because granting a stranger read access to a vehicle's
 * history should not be the easiest thing to hit by accident.
 */

/* Long enough to read a name and a vehicle and decide, short enough not to
   camp on the screen. Paused on hover, so this is a floor rather than a cap. */
const VISIBLE_MS = 10_000;

/* The app had no polling at all: the pending count refreshed on navigation.
   25s is a compromise between a mechanic standing at a counter and a free-tier
   API answering every open tab. Skipped entirely while the tab is hidden. */
const POLL_MS = 25_000;

export default function AccessRequestToasts({ enabled, preferences, mechanicRequests }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [toasts, setToasts] = useState([]);
  const [busyId, setBusyId] = useState(null);

  /* Requests already shown this session. Without it every poll would re-toast
     the same pending request every 25 seconds until it was answered. */
  const seenRef = useRef(new Set());
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const startTimer = useCallback((id) => {
    const existing = timersRef.current.get(id);
    if (existing) window.clearTimeout(existing);
    timersRef.current.set(id, window.setTimeout(() => dismiss(id), VISIBLE_MS));
  }, [dismiss]);

  const holdTimer = useCallback((id) => {
    const existing = timersRef.current.get(id);
    if (existing) {
      window.clearTimeout(existing);
      timersRef.current.delete(id);
    }
  }, []);

  // ------------------------------------------------------------ polling

  useEffect(() => {
    /* Only the request poll is gated on the mechanic-request switch. Turning
       that off should silence mechanics, not the whole surface — draft notices
       have their own switch, checked per notification below. */
    if (!enabled || !mechanicRequests) return undefined;

    let active = true;

    async function check() {
      // A hidden tab has nobody to show a toast to, and polling it only spends
      // somebody's API quota.
      if (document.visibilityState !== 'visible') return;
      try {
        const pending = await getPendingMechanicAccessRequests({ fresh: true });
        if (!active || !Array.isArray(pending)) return;

        const fresh = pending.filter((request) => {
          const id = request.mechanicAccessRequestId;
          if (!id || seenRef.current.has(id)) return false;
          seenRef.current.add(id);
          return true;
        });

        if (fresh.length) {
          setToasts((current) => [
            ...current,
            ...fresh.map((request) => ({ id: request.mechanicAccessRequestId, request })),
          ]);
          fresh.forEach((request) => startTimer(request.mechanicAccessRequestId));
        }
      } catch {
        // A failed poll is not worth telling anyone about; the next one is 25
        // seconds away and Notifications still holds the truth.
      }
    }

    check();
    const interval = window.setInterval(check, POLL_MS);
    // Catch up immediately when somebody comes back to the tab rather than
    // making them wait out the remainder of an interval.
    document.addEventListener('visibilitychange', check);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled, mechanicRequests, startTimer]);

  /* ------------------------------------------------- local notifications

     Draft-review and expired-session notices are not server state: they are
     written to this browser the moment they happen, and an event fires with
     them. So these need no polling — the app already says when one arrives.

     The rule that matters is the suppression below. "Your draft needs review"
     is raised the instant a draft is created, and creating a draft navigates
     straight to that draft. Without the check, the toast would appear on the
     very page it points at, telling you to go where you already are. */
  useEffect(() => {
    if (!enabled) return undefined;

    /* Everything already stored is history, not news. Without this the first
       render would toast every notification the browser has kept. */
    const known = new Set(getLocalNotifications().map((entry) => entry.id));

    function onChange() {
      const arrived = getLocalNotifications().filter((entry) => {
        if (!entry?.id || known.has(entry.id)) return false;
        known.add(entry.id);
        return true;
      });

      const worth = arrived.filter((entry) => {
        // Respect the same switches as the Notifications page.
        if (entry.category && !isNotificationEnabled(entry.category, preferences)) return false;
        // Do not tell somebody to go where they already are.
        if (entry.href && location.pathname.startsWith(entry.href)) return false;
        return true;
      });

      if (!worth.length) return;
      setToasts((current) => [...current, ...worth.map((entry) => ({ id: entry.id, local: entry }))]);
      worth.forEach((entry) => startTimer(entry.id));
    }

    window.addEventListener(LOCAL_NOTIFICATIONS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LOCAL_NOTIFICATIONS_CHANGED_EVENT, onChange);
  }, [enabled, preferences, location.pathname, startTimer]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  // ------------------------------------------------------------ decisions

  async function decide(id, approve) {
    if (busyId) return;
    setBusyId(id);
    holdTimer(id);
    try {
      await (approve ? approveMechanicAccessRequest(id) : denyMechanicAccessRequest(id));
      forgetPendingMechanicAccessRequests();
      dismiss(id);
    } catch {
      /* Leave the toast up and stop its timer. The owner can try again or open
         Notifications, which is the same decision in a place that does not
         disappear. */
      setToasts((current) => current.map((toast) => (
        toast.id === id
          ? { ...toast, error: 'That did not go through. Try again, or open Notifications.' }
          : toast
      )));
    } finally {
      setBusyId(null);
    }
  }

  if (!enabled || toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map(({ id, request, local, error }) => {
        /* A local notice is an FYI with one place to go; a request is a
           decision. Same surface, different furniture. */
        if (local) {
          return (
            <article
              className="toast"
              key={id}
              onMouseEnter={() => holdTimer(id)}
              onMouseLeave={() => startTimer(id)}
              onFocusCapture={() => holdTimer(id)}
              onBlurCapture={() => startTimer(id)}
            >
              <p className="toast__lead"><strong>{local.title}</strong></p>
              {local.body && <p className="toast__reason">{local.body}</p>}
              <div className="toast__actions">
                {local.href && (
                  <button
                    className="toast__btn toast__btn--go"
                    type="button"
                    onClick={() => { dismiss(id); navigate(local.href); }}
                  >
                    {local.action || 'Open'}
                  </button>
                )}
              </div>
              <button
                className="toast__close"
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(id)}
              >
                ×
              </button>
            </article>
          );
        }

        const who = request.mechanicName || 'A mechanic';
        const where = request.shopName ? ` from ${request.shopName}` : '';
        return (
          <article
            className="toast"
            key={id}
            onMouseEnter={() => holdTimer(id)}
            onMouseLeave={() => startTimer(id)}
            onFocusCapture={() => holdTimer(id)}
            onBlurCapture={() => startTimer(id)}
          >
            <p className="toast__lead">
              <strong>{who}</strong>{where} is asking to see the history for{' '}
              <strong>{request.vehicleLabel || 'your vehicle'}</strong>.
            </p>
            {request.reason && <p className="toast__reason">&ldquo;{request.reason}&rdquo;</p>}
            {error && <p className="toast__error">{error}</p>}

            <div className="toast__actions">
              {/* Deny sits first and is the plain button: it is the safe answer,
                  and the one somebody in a hurry should land on. */}
              <button
                className="toast__btn"
                type="button"
                disabled={busyId === id}
                onClick={() => decide(id, false)}
              >
                Deny
              </button>
              <button
                className="toast__btn toast__btn--go"
                type="button"
                disabled={busyId === id}
                onClick={() => decide(id, true)}
              >
                {busyId === id ? 'Working…' : 'Approve'}
              </button>
              <button
                className="toast__btn toast__btn--quiet"
                type="button"
                onClick={() => { dismiss(id); navigate('/notifications'); }}
              >
                Open
              </button>
            </div>

            <button
              className="toast__close"
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(id)}
            >
              ×
            </button>
          </article>
        );
      })}
    </div>
  );
}
