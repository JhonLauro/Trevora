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

/**
 * Plate first — it is what an owner recognises their own car by.
 *
 * Never repeats the name: with no nickname the name already *is* the model
 * line, and printing it again underneath is two lines saying one thing.
 */
export function displayVehicleSubtitle(vehicle) {
  const modelLine = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ');
  const name = displayVehicleName(vehicle);
  const parts = [vehicle?.plateNumber, modelLine === name ? null : modelLine].filter(Boolean);
  return parts.join(' · ') || 'No plate recorded';
}

export function vehicleInitials(vehicle) {
  return displayVehicleName(vehicle).trim().charAt(0).toUpperCase() || 'V';
}
