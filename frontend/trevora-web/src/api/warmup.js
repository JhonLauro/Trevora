import { API_BASE_URL } from './http.js';

/**
 * Wakes the API before anyone waits on it.
 *
 * <p>The API runs on a Render free instance, which sleeps after about fifteen
 * minutes with no traffic. Waking it means booting a Spring Boot container on a
 * throttled CPU, and the first request in a while pays for all of it. An owner
 * uploading three receipts measured four minutes; the same upload warm was
 * twenty seconds. Nothing in the extraction path was slow — the server was
 * asleep.
 *
 * <p>So the wake-up is started when someone opens the app, and again when they
 * open the receipt screen, which is a good half-minute before they have finished
 * choosing photographs. The boot overlaps the part of the flow where they are
 * busy, instead of the part where they are staring at a progress bar.
 *
 * <p>This hides the cold start. It does not remove it: an upload begun in the
 * first seconds after a cold open still waits. The honest fix is a paid instance
 * that does not sleep.
 */

/**
 * Sent {@code no-cors} because it deliberately cannot be read.
 *
 * <p>CORS on the API covers {@code /api/**} only, and {@code /health} sits
 * outside it — a normal fetch would be blocked by the browser before it told us
 * anything. An opaque response is enough here: the request still reaches the
 * server and still wakes it, and the promise still settles when the server
 * answers, which is the only fact this module reports. Adding /health to the
 * backend's CORS mapping would make the body readable, and would be a change to
 * a shared config file for information nobody needs.
 */
const HEALTH_URL = API_BASE_URL.replace(/\/api\/?$/, '') + '/health';

/**
 * Long enough to cover a normal session, short enough to re-warm before Render's
 * roughly fifteen-minute idle timeout can put the instance back to sleep.
 */
const WARM_TTL_MS = 10 * 60 * 1000;

/** Past this we stop claiming to be waking anything; something else is wrong. */
const WARM_TIMEOUT_MS = 90 * 1000;

let inFlight = null;
let warmedAt = 0;

/**
 * Starts a wake-up unless one is already running or the API was reached
 * recently. Safe to call on every mount — that is the intended use.
 *
 * <p>Never rejects. A failed warm-up is not a failed anything: the real request
 * follows and reports its own errors, and surfacing this one would put a network
 * error in front of someone who has not asked for anything yet.
 */
export function warmUpApi() {
  if (inFlight) {
    return inFlight;
  }
  if (warmedAt && Date.now() - warmedAt < WARM_TTL_MS) {
    return Promise.resolve();
  }

  const started = Date.now();
  inFlight = fetch(HEALTH_URL, { mode: 'no-cors', cache: 'no-store' })
    .then(() => {
      warmedAt = Date.now();
      if (import.meta.env.DEV) {
        console.debug(`[warmup] API answered in ${Date.now() - started}ms`);
      }
    })
    .catch(() => {
      // Swallowed on purpose. See the note above. Logged separately from the
      // success case because "answered" and "was unreachable" are opposite
      // facts, and a warm-up that reports both the same way is worse than one
      // that reports neither.
      if (import.meta.env.DEV) {
        console.debug(`[warmup] API unreachable after ${Date.now() - started}ms`);
      }
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Whether the API has answered recently enough that an upload will not be
 * paying for a boot.
 *
 * <p>Used to word the upload overlay honestly. False means either "still waking"
 * or "we never got an answer", and the overlay says the softer of the two,
 * because the difference is invisible to the person waiting and only one of them
 * is actionable.
 */
export function isApiWarm() {
  return Boolean(warmedAt) && Date.now() - warmedAt < WARM_TTL_MS;
}

/** True while a wake-up is outstanding and still plausibly a wake-up. */
export function isApiWaking() {
  return Boolean(inFlight) && !isApiWarm();
}

export { WARM_TIMEOUT_MS, HEALTH_URL };
