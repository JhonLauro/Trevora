import { useEffect, useMemo, useState } from 'react';
import { getVehicles } from '../api/vehicles';
import { getVehicleServiceHistory } from '../api/serviceHistory';
import { displayVehicleName, displayVehicleSubtitle } from '../utils/vehicleText';
import { needsReview } from '../utils/recordStatus';

/**
 * Every vehicle the owner has, each with its own records.
 *
 * The dashboard shows one card per vehicle, each carrying its own numbers, so
 * history is fetched per vehicle and kept per vehicle. A request per vehicle
 * is fine at two or three cars and avoids inventing a cross-vehicle endpoint;
 * if the count ever grows, that endpoint is the fix, not caching here.
 *
 * `records[0]` is the last service — the history call already sorts newest.
 */
export default function useGarage() {
  const [garages, setGarages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);

    getVehicles()
      .then((vehicles) => Promise.all(
        vehicles.map((vehicle) => getVehicleServiceHistory(vehicle.vehicleId, { sort: 'newest' })
          .then((history) => ({ vehicle, records: history.records ?? [] }))
          // One vehicle failing to load its history should not blank the whole
          // garage; that card renders as empty instead.
          .catch(() => ({ vehicle, records: [] }))),
      ))
      .then((data) => {
        if (!active) return;
        setGarages(data);
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
