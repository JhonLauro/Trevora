import { useEffect, useState } from 'react';
import { getPendingMechanicAccessRequests } from '../api/qrAccess.js';

/*
 * The mechanic requests waiting for an answer, kept current for everything
 * that shows them: the sidebar badge, the toast, the Notifications page.
 *
 * WHY THIS EXISTS
 *
 * The badge used to be fetched on route change only, so an owner sitting on
 * their Garage while a mechanic waited at the counter saw nothing until they
 * clicked something. The toast polled separately every 25 seconds, so the two
 * disagreed and neither was quick. This is one poll, shared: however many
 * components subscribe, there is a single request in flight.
 *
 * WHAT IT COSTS
 *
 * One small authenticated GET every eight seconds per open, visible tab. It is
 * a token check and an indexed query -- no AI, nothing metered -- and it stops
 * entirely when the tab is hidden, which is where a background tab's polling
 * would otherwise spend somebody's free-tier quota all day. Coming back to the
 * tab asks immediately rather than waiting out the remainder of an interval.
 *
 * Eight seconds is the "mechanic standing at the counter" number: long enough
 * not to hammer a free-tier API, short enough that the owner looks up and the
 * request is already there.
 */

const POLL_MS = 8_000;

const subscribers = new Set();
let latest = [];
let timer = null;
let inFlight = false;

function idsOf(requests) {
  return requests.map((request) => request.mechanicAccessRequestId).join('|');
}

async function poll() {
  // A hidden tab has nobody to tell, and polling it only spends API quota.
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (inFlight) return;
  inFlight = true;
  try {
    const data = await getPendingMechanicAccessRequests({ fresh: true });
    if (!Array.isArray(data)) return;
    const changed = idsOf(data) !== idsOf(latest);
    latest = data;
    // Only when the set actually changes: a poll that finds the same thing
    // should not re-render every screen that is watching.
    if (changed) subscribers.forEach((notify) => notify(latest));
  } catch {
    // Keep the last known answer. The next poll is eight seconds away, and
    // Notifications still holds the truth.
  } finally {
    inFlight = false;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') poll();
}

function start() {
  if (timer) return;
  timer = window.setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', poll);
  poll();
}

function stop() {
  window.clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('focus', poll);
}

/** Asks again now. For after approving or denying, so nothing lingers. */
export function refreshPendingAccessRequests() {
  return poll();
}

/**
 * The pending requests, refreshed on their own. Pass false when the owner has
 * turned mechanic-request notifications off, or is not an owner at all: then
 * this reports nothing and, if it was the last subscriber, the poll stops.
 */
export function usePendingAccessRequests(enabled) {
  const [requests, setRequests] = useState(() => (enabled ? latest : []));

  useEffect(() => {
    if (!enabled) {
      setRequests([]);
      return undefined;
    }
    // Whatever the shared poll already knows, rather than an empty first paint.
    setRequests(latest);
    subscribers.add(setRequests);
    start();
    return () => {
      subscribers.delete(setRequests);
      if (subscribers.size === 0) stop();
    };
  }, [enabled]);

  return requests;
}
