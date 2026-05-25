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
