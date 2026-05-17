import { apiRequest } from './http';

export function getMechanicSessionHistory(sessionId) {
  return apiRequest(`/mechanic-access/sessions/${encodeURIComponent(sessionId)}/history`, {
    skipAuthHeaders: true,
  });
}

export function getMechanicSessionRecord(sessionId, recordId) {
  return apiRequest(`/mechanic-access/sessions/${encodeURIComponent(sessionId)}/history/${encodeURIComponent(recordId)}`, {
    skipAuthHeaders: true,
  });
}

export function searchMechanicSessionHistory(sessionId, query) {
  return apiRequest(
    `/mechanic-access/sessions/${encodeURIComponent(sessionId)}/history/search?query=${encodeURIComponent(query)}`,
    { skipAuthHeaders: true }
  );
}
