import { apiRequest } from './http';
import { mechanicSessionToken } from './mechanicSessionToken.js';

/*
 * The session id is in the URL; the token is not. Sending it as a header is
 * what makes a leaked link useless on its own -- see mechanicSessionToken.js.
 * A missing token still sends the request: the server answers it the same way
 * it answers a wrong one, so the client never learns which session ids exist.
 */
function sessionHeaders(sessionId) {
  const token = mechanicSessionToken(sessionId);
  return token ? { 'X-Mechanic-Session-Token': token } : {};
}

export function getMechanicSessionHistory(sessionId) {
  return apiRequest(`/mechanic-access/sessions/${encodeURIComponent(sessionId)}/history`, {
    skipAuthHeaders: true,
    headers: sessionHeaders(sessionId),
  });
}

export function getMechanicSessionRecord(sessionId, recordId) {
  return apiRequest(`/mechanic-access/sessions/${encodeURIComponent(sessionId)}/history/${encodeURIComponent(recordId)}`, {
    skipAuthHeaders: true,
    headers: sessionHeaders(sessionId),
  });
}

export function searchMechanicSessionHistory(sessionId, query) {
  return apiRequest(
    `/mechanic-access/sessions/${encodeURIComponent(sessionId)}/history/search?query=${encodeURIComponent(query)}`,
    { skipAuthHeaders: true, headers: sessionHeaders(sessionId) }
  );
}
