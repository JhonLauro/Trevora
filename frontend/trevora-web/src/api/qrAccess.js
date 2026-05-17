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

export function getPendingMechanicAccessRequests() {
  return apiRequest('/mechanic-access/requests/pending');
}

export function approveMechanicAccessRequest(requestId) {
  return apiRequest(`/mechanic-access/requests/${requestId}/approve`, {
    method: 'POST',
  });
}

export function denyMechanicAccessRequest(requestId) {
  return apiRequest(`/mechanic-access/requests/${requestId}/deny`, {
    method: 'POST',
  });
}

export function getMechanicSessionHistory(sessionId) {
  return apiRequest(`/mechanic-access/sessions/${encodeURIComponent(sessionId)}/history`, {
    skipAuthHeaders: true,
  });
}
