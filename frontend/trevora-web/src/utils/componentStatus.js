/**
 * Which parts of a vehicle have been worked on, and which have nothing on
 * record.
 *
 * **Two states, not four.** An earlier version graded every component as
 * recently-serviced / due-soon / overdue against a hardcoded interval table.
 * That was dropped for two reasons:
 *
 * 1. The intervals were car conventions applied to every vehicle. A scooter
 *    needs its oil changed several times more often than a sedan, so the
 *    table told riders their engine was fine when it was not. A maintenance
 *    tool that is confidently wrong about maintenance is worse than one that
 *    stays quiet.
 * 2. Predicting when a service is next due is not among the project's
 *    objectives, and the proposal lists predictive maintenance as out of
 *    scope. Consolidating and presenting what actually happened *is* the
 *    objective, and that is all this does now.
 *
 * Restoring due dates means real per-model intervals, sourced per vehicle
 * class — see planning/DEFERRED.md.
 */
import { COMPONENT_LABELS, componentKeysFor, inferComponents } from './serviceComponents';
import { vehicleClassFor } from '../data/vehicleCatalog';

export const STATUS_TEXT = {
  ok: 'Has service records',
  none: 'No record found',
};

/**
 * @returns {{key, label, status, statusText, records, lastService,
 *            lastOdometer, totalCost}[]} one entry per component that applies
 *   to this vehicle class, documented ones first.
 */
export function componentStatuses(records, vehicle) {
  const vehicleClass = vehicleClassFor(vehicle?.bodyType);
  const byComponent = new Map(componentKeysFor(vehicleClass).map((key) => [key, []]));

  (records || []).forEach((record) => {
    inferComponents(record, vehicleClass).forEach((key) => {
      // A component the taxonomy does not carry for this class is dropped
      // rather than added: a motorcycle has no aircon, whatever the receipt
      // text happens to match.
      if (byComponent.has(key)) byComponent.get(key).push(record);
    });
  });

  return [...byComponent.entries()]
    .map(([key, componentRecords]) => ({
      key,
      label: COMPONENT_LABELS[key] || key,
      records: componentRecords,
      status: componentRecords.length ? 'ok' : 'none',
      statusText: componentRecords.length ? STATUS_TEXT.ok : STATUS_TEXT.none,
      // The history call sorts newest first, so index 0 is the last service.
      lastService: componentRecords[0]?.serviceDate ?? null,
      lastOdometer: componentRecords[0]?.odometer ?? null,
      totalCost: componentRecords.reduce((sum, record) => sum + Number(record.totalCost || 0), 0),
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'ok' ? -1 : 1;
      if (a.status === 'ok') return String(b.lastService || '').localeCompare(String(a.lastService || ''));
      return a.label.localeCompare(b.label);
    });
}
