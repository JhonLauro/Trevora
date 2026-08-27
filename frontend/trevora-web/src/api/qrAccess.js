import { apiRequest } from './http';

export function createQRAccessRequest(vehicleProfileId) {
  return apiRequest('/qr-access/requests', {
    method: 'POST',
    body: JSON.stringify({ vehicleProfileId }),
  });
}

export function getVehicleQRAccessRequests(vehicleProfileId) {
  return apiRequest(`/qr-access/requests?vehicleProfileId=${encodeURIComponent(vehicleProfileId)}`);
}

export function getPublicQRAccessRequest(token) {
  return apiRequest(`/qr-access/requests/${encodeURIComponent(token)}`, {
    skipAuthHeaders: true,
  });
}

export function submitMechanicAccessRequest(token, payload) {
  return apiRequest(`/qr-access/requests/${encodeURIComponent(token)}/mechanic-request`, {
    method: 'POST',
    skipAuthHeaders: true,
    body: JSON.stringify(payload),
  });
}

export function getMechanicRequestStatus(token) {
  return apiRequest(`/qr-access/requests/${encodeURIComponent(token)}/mechanic-request/status`, {
    skipAuthHeaders: true,
  });
}

export function getMechanicAccessRequests(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest(`/mechanic-access/requests${query}`);
}

export function getOwnerMechanicAccessSessions(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest(`/mechanic-access/owner/sessions${query}`);
}

export function revokeOwnerMechanicAccessSession(sessionId) {
  return apiRequest(`/mechanic-access/owner/sessions/${encodeURIComponent(sessionId)}/revoke`, {
    method: 'POST',
  });
}

/* Two components ask for this: the shell, to number the sidebar badge, and the
   Garage, for its attention strip. The shell also re-asks on every route
   change, so a session spent moving around the app was making this call over
   and over -- each one an authenticated round trip to a different region for
   an answer that had not changed.

   A short window collapses all of that. Callers keep calling whenever they
   like; what they get back inside the window is the answer already fetched,
   and two callers arriving together share one request rather than making two.
   Anything that changes the answer clears it -- see `forgetPendingMechanicAccessRequests`. */
const PENDING_TTL_MS = 30_000;

let pendingCache = null;   // { at: number, data: array }
let pendingInFlight = null;

export function getPendingMechanicAccessRequests({ fresh = false } = {}) {
  const now = Date.now();

  if (!fresh && pendingCache && now - pendingCache.at < PENDING_TTL_MS) {
    return Promise.resolve(pendingCache.data);
  }
  if (!fresh && pendingInFlight) {
    return pendingInFlight;
  }

  pendingInFlight = apiRequest('/mechanic-access/requests/pending')
    .then((data) => {
      pendingCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      pendingInFlight = null;
    });

  return pendingInFlight;
}

/** Called after anything that changes what is pending, so the next read is a
    real one rather than a stale count sitting on the sidebar. */
export function forgetPendingMechanicAccessRequests() {
  pendingCache = null;
}

export function approveMechanicAccessRequest(requestId) {
  return apiRequest(`/mechanic-access/requests/${requestId}/approve`, {
    method: 'POST',
  }).then((result) => {
    forgetPendingMechanicAccessRequests();
    return result;
  });
}

export function denyMechanicAccessRequest(requestId) {
  return apiRequest(`/mechanic-access/requests/${requestId}/deny`, {
    method: 'POST',
  }).then((result) => {
    forgetPendingMechanicAccessRequests();
    return result;
  });
}

export function getMechanicSessionHistory(sessionId) {
  return apiRequest(`/mechanic-access/sessions/${encodeURIComponent(sessionId)}/history`, {
    skipAuthHeaders: true,
  });
}
