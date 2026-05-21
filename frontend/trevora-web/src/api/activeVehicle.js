export const ACTIVE_VEHICLE_ID_KEY = 'trevora.activeVehicleId';
export const ACTIVE_VEHICLE_LABEL_KEY = 'trevora.activeVehicleLabel';
export const ACTIVE_VEHICLE_SUBTITLE_KEY = 'trevora.activeVehicleSubtitle';

export function getActiveVehicleId() {
  return window.localStorage.getItem(ACTIVE_VEHICLE_ID_KEY);
}

export function getActiveVehicleLabel() {
  return window.localStorage.getItem(ACTIVE_VEHICLE_LABEL_KEY) || 'Select vehicle';
}

export function getActiveVehicleSubtitle() {
  return window.localStorage.getItem(ACTIVE_VEHICLE_SUBTITLE_KEY) || 'No active vehicle';
}

export function setActiveVehicleSelection(vehicle) {
  window.localStorage.setItem(ACTIVE_VEHICLE_ID_KEY, vehicle.vehicleId);
  window.localStorage.setItem(ACTIVE_VEHICLE_LABEL_KEY, displayVehicleName(vehicle));
  window.localStorage.setItem(ACTIVE_VEHICLE_SUBTITLE_KEY, displayVehicleSubtitle(vehicle));
}

export function clearActiveVehicleSelection() {
  window.localStorage.removeItem(ACTIVE_VEHICLE_ID_KEY);
  window.localStorage.removeItem(ACTIVE_VEHICLE_LABEL_KEY);
  window.localStorage.removeItem(ACTIVE_VEHICLE_SUBTITLE_KEY);
}

export function displayVehicleName(vehicle) {
  return vehicle?.nickname || [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'Selected vehicle';
}

export function displayVehicleSubtitle(vehicle) {
  return vehicle?.plateNumber || [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'Registered vehicle';
}
