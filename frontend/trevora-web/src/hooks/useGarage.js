import { useEffect, useMemo, useState } from 'react';
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

  return { garages, allRecords, reviewCount, loading, error };
}
