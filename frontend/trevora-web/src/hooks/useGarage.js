import { useCallback, useEffect, useMemo, useState } from 'react';
import { getGarageSummary } from '../api/serviceHistory';
import { displayVehicleName, displayVehicleSubtitle } from '../utils/vehicleText';
import { needsReview } from '../utils/recordStatus';

/**
 * Every vehicle the owner has, each with its own records.
 *
 * <p>One request, not one per vehicle. This used to fetch the vehicle list and
 * then a history call for each car, which its own comment described as fine at
 * two or three cars and predicted would need a cross-vehicle endpoint if the
 * count grew. The count was not the problem in the end -- the round trips
 * were. Every one of those calls paid a separate authentication against a
 * different region before it read anything, so even two cars meant three
 * sequential-ish waits for a screen that should be one.
 *
 * <p>`records[0]` is the last service — the endpoint sorts newest first within
 * each vehicle.
 */
export default function useGarage() {
  const [garages, setGarages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);

    getGarageSummary()
      .then((summary) => {
        if (!active) return;
        const recordsByVehicle = new Map(
          (summary?.records ?? []).map((entry) => [entry.vehicleId, entry.records ?? []]),
        );
        setGarages((summary?.vehicles ?? []).map((vehicle) => ({
          vehicle,
          records: recordsByVehicle.get(vehicle.vehicleId) ?? [],
        })));
        setError('');
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  /** Every record across every vehicle, newest first, tagged with its vehicle. */
  const allRecords = useMemo(() => garages
    .flatMap(({ vehicle, records }) => records.map((record) => ({
      ...record,
      vehicleName: displayVehicleName(vehicle),
      vehicleSubtitle: displayVehicleSubtitle(vehicle),
    })))
    .sort((a, b) => String(b.serviceDate || '').localeCompare(String(a.serviceDate || ''))),
  [garages]);

  const reviewCount = useMemo(() => allRecords.filter(needsReview).length, [allRecords]);

  /**
   * Drops a deleted record from the loaded garage.
   *
   * <p>Here rather than in the page because `garages` is the source both
   * `allRecords` and `reviewCount` are derived from — a page that filtered a
   * deleted row out of its own copy would leave the review badge counting a
   * record that no longer exists.
   *
   * <p>No refetch: the server has already confirmed the delete by the time
   * this is called, and re-reading the whole garage to learn one row is gone
   * is a second round trip to be told what we know.
   */
  const removeRecord = useCallback((recordId) => {
    if (!recordId) return;
    setGarages((current) => current.map((entry) => (
      entry.records.some((record) => record.recordId === recordId)
        ? { ...entry, records: entry.records.filter((record) => record.recordId !== recordId) }
        : entry
    )));
  }, []);

  return { garages, allRecords, reviewCount, loading, error, removeRecord };
}
