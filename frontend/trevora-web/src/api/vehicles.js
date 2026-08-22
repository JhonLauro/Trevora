import { apiRequest } from './http';

export function getVehicles() {
  return apiRequest('/vehicles');
}

export function createVehicle(vehicle) {
  return apiRequest('/vehicles', {
    method: 'POST',
    body: JSON.stringify(vehicle),
  });
}

export function getVehicle(vehicleId) {
  return apiRequest(`/vehicles/${vehicleId}`);
}

export function updateVehicle(vehicleId, vehicle) {
  return apiRequest(`/vehicles/${encodeURIComponent(vehicleId)}`, {
    method: 'PUT',
    body: JSON.stringify(vehicle),
  });
}

/**
 * Deletes the vehicle and everything filed under it — records, drafts and any
 * sharing that pointed at it. There is no undo, so callers confirm first.
 */
export function deleteVehicle(vehicleId) {
  return apiRequest(`/vehicles/${encodeURIComponent(vehicleId)}`, { method: 'DELETE' });
}
