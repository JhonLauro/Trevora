/**
 * The mechanic's half of their session credential.
 *
 * <p>A mechanic's access used to be the session id alone, and that id lives in
 * the URL. URLs leak in ordinary ways — browser history, `Referer` headers to
 * anything the page loads, server logs, and screenshots. Several screenshots
 * taken while building this app contained live session URLs.
 *
 * <p>The server has always issued a `sessionToken` alongside the id and handed
 * it to this browser when the owner approved the request; nothing kept it. Now
 * it is stored here and sent as a header, so the two halves travel by different
 * routes and a leaked URL on its own opens nothing.
 *
 * <p>Stored per session id rather than as one "current session", because a
 * mechanic at a busy shop may hold approvals for more than one vehicle at once
 * and switching between them should not sign them out of the other.
 */

const STORE_KEY = 'trevora.mechanicSessionTokens';

/*
 * localStorage, not sessionStorage: a mechanic reads a history over a job that
 * outlasts a browser tab, and losing access on an accidental close would push
 * them back through a QR scan and a second owner approval.
 *
 * The cost is that the token outlives the tab on a shared workshop device, so
 * each entry carries the session's own expiry and is dropped on the first read
 * after it passes. Sessions are short-lived by design; this keeps the storage
 * as short-lived as the access it represents.
 */
function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Private mode, disabled storage, or something else wrote here. An
    // unreadable store is an empty one; it must never break the page.
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Full or unavailable. The request will simply go without a token and be
    // refused, which is the safe direction.
  }
}

/** Drops entries whose session has expired. Called on every read. */
function pruned(store) {
  const now = Date.now();
  let changed = false;
  const kept = {};
  for (const [sessionId, entry] of Object.entries(store)) {
    if (!entry?.token) continue;
    if (entry.expiresAt && Date.parse(entry.expiresAt) <= now) {
      changed = true;
      continue;
    }
    kept[sessionId] = entry;
  }
  if (changed) writeStore(kept);
  return kept;
}

/**
 * Remember the token for a session. Called once, when the owner's approval
 * comes back and hands the mechanic their session.
 */
export function rememberMechanicSessionToken(session) {
  const sessionId = session?.mechanicAccessSessionId;
  const token = session?.sessionToken;
  if (!sessionId || !token) return;

  const store = pruned(readStore());
  store[sessionId] = { token, expiresAt: session.expiresAt ?? null };
  writeStore(store);
}

/** The token for this session, or null if this browser was never given one. */
export function mechanicSessionToken(sessionId) {
  if (!sessionId) return null;
  return pruned(readStore())[sessionId]?.token ?? null;
}

/** Forgets one session — used when the server says it is over. */
export function forgetMechanicSessionToken(sessionId) {
  const store = pruned(readStore());
  if (store[sessionId]) {
    delete store[sessionId];
    writeStore(store);
  }
}
