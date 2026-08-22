import { apiRequest } from './http';

export function getVehicleServiceHistory(vehicleId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.sort) params.set('sort', filters.sort);
  // `serviceType` now matches against any item in a record's `services` array
  // (a visit can have multiple distinct services), not a single flat field.
  if (filters.serviceType) params.set('serviceType', filters.serviceType);
  if (filters.keyword) params.set('keyword', filters.keyword);

  const query = params.toString();
  return apiRequest(`/vehicles/${vehicleId}/history${query ? `?${query}` : ''}`);
}

export function getVehicleServiceRecord(vehicleId, recordId) {
  return apiRequest(`/vehicles/${vehicleId}/history/${recordId}`);
}

/** Removes one confirmed record. The draft it came from is left in place. */
export function deleteVehicleServiceRecord(vehicleId, recordId) {
  return apiRequest(
    `/vehicles/${encodeURIComponent(vehicleId)}/history/${encodeURIComponent(recordId)}`,
    { method: 'DELETE' },
  );
}
