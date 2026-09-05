import { apiRequest } from './http';

/**
 * Owner-written concerns about a vehicle.
 *
 * The mechanic's read is not here: their session gets open concerns folded into
 * the shared-history payload it already fetches, so that page makes one request
 * rather than two.
 */

export function getConcerns(vehicleId) {
  return apiRequest(`/vehicles/${encodeURIComponent(vehicleId)}/concerns`);
}

export function createConcern(vehicleId, note) {
  return apiRequest(`/vehicles/${encodeURIComponent(vehicleId)}/concerns`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export function updateConcern(vehicleId, concernId, note) {
  return apiRequest(
    `/vehicles/${encodeURIComponent(vehicleId)}/concerns/${encodeURIComponent(concernId)}`,
    { method: 'PUT', body: JSON.stringify({ note }) },
  );
}

/** Resolve, or reopen when `resolved` is false. */
export function setConcernResolved(vehicleId, concernId, resolved) {
  return apiRequest(
    `/vehicles/${encodeURIComponent(vehicleId)}/concerns/${encodeURIComponent(concernId)}/resolution`,
    { method: 'PATCH', body: JSON.stringify({ resolved }) },
  );
}

export function deleteConcern(vehicleId, concernId) {
  return apiRequest(
    `/vehicles/${encodeURIComponent(vehicleId)}/concerns/${encodeURIComponent(concernId)}`,
    { method: 'DELETE' },
  );
}
