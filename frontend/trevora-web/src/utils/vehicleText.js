/**
 * Vehicle display strings.
 *
 * Copied out of `api/activeVehicle.js` so the Garage and Vehicle screens carry
 * no dependency on the global active-vehicle module, which the new information
 * architecture retires. Vehicle identity now comes from the route param.
 */

export function displayVehicleName(vehicle) {
  return vehicle?.nickname
    || [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ')
    || 'Vehicle';
}

/** Plate first — it is what an owner recognises their own car by. */
export function displayVehicleSubtitle(vehicle) {
  const modelLine = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ');
  if (vehicle?.nickname) {
    return [vehicle.plateNumber, modelLine].filter(Boolean).join(' \u00b7 ') || 'Registered vehicle';
  }
  return vehicle?.plateNumber || modelLine || 'Registered vehicle';
}

export function vehicleInitials(vehicle) {
  return displayVehicleName(vehicle).trim().charAt(0).toUpperCase() || 'V';
}
