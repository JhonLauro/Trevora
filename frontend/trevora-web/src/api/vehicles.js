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

/**
 * Edits a vehicle, applying only the fields in `changes`.
 *
 * A field left out is untouched; a field sent as `null` is cleared. That
 * distinction is the point — clearing a warranty term is a real edit, so
 * "absent" and "null" cannot mean the same thing.
 *
 * Send exactly what the editor owns and nothing else. Padding the object out
 * with unchanged values still reaches the server, but it puts back the hazard
 * this replaced: a stale copy of a field the user changed somewhere else would
 * overwrite it. There is no longer a PUT to fall back on, deliberately — the
 * whole-row endpoint is what three separate editors kept getting wrong.
 */
export function patchVehicle(vehicleId, changes) {
  return apiRequest(`/vehicles/${encodeURIComponent(vehicleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

/**
 * Deletes the vehicle and everything filed under it — records, drafts and any
 * sharing that pointed at it. There is no undo, so callers confirm first.
 */
export function deleteVehicle(vehicleId) {
  return apiRequest(`/vehicles/${encodeURIComponent(vehicleId)}`, { method: 'DELETE' });
}
