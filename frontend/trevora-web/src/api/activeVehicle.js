export const ACTIVE_VEHICLE_ID_KEY = 'trevora.activeVehicleId';
export const ACTIVE_VEHICLE_LABEL_KEY = 'trevora.activeVehicleLabel';
export const ACTIVE_VEHICLE_SUBTITLE_KEY = 'trevora.activeVehicleSubtitle';

export function clearActiveVehicleSelection() {
  window.localStorage.removeItem(ACTIVE_VEHICLE_ID_KEY);
  window.localStorage.removeItem(ACTIVE_VEHICLE_LABEL_KEY);
  window.localStorage.removeItem(ACTIVE_VEHICLE_SUBTITLE_KEY);
}
