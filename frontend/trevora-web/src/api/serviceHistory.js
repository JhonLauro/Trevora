import { apiRequest } from './http';

export function getVehicleServiceHistory(vehicleId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.serviceType) params.set('serviceType', filters.serviceType);
  if (filters.keyword) params.set('keyword', filters.keyword);

  const query = params.toString();
  return apiRequest(`/vehicles/${vehicleId}/history${query ? `?${query}` : ''}`);
}

export function getVehicleServiceRecord(vehicleId, recordId) {
  return apiRequest(`/vehicles/${vehicleId}/history/${recordId}`);
}
