import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getServiceDraft } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

function vehicleName(vehicle, draft) {
  if (!vehicle) return draft?.vehicleId ?? 'selected vehicle';
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

export default function ServiceRecordSavedPage() {
  const { draftId } = useParams();
  const location = useLocation();
  const [draft, setDraft] = useState(location.state?.draft ?? null);
  const [vehicle, setVehicle] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const draftPromise = draft ? Promise.resolve(draft) : getServiceDraft(draftId);
    draftPromise
      .then(async (draftData) => {
        if (active) setDraft(draftData);
        try {
          const vehicleData = await getVehicle(draftData.vehicleId);
          if (active) setVehicle(vehicleData);
        } catch {
          if (active) setVehicle(null);
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      });

    return () => {
      active = false;
    };
  }, [draft, draftId]);

  const addAnotherPath = draft?.vehicleId ? `/service-input/${draft.vehicleId}` : '/vehicles';

  return (
    <main className="page-shell module-two-page">
      {error && <div className="alert">{error}</div>}
      <section className="saved-record-state">
        <div className="saved-icon">OK</div>
        <h1>Record saved</h1>
        <p>Added to {vehicleName(vehicle, draft)} from this {draft?.inputMethod ?? 'service'} draft.</p>
        {location.state?.serviceRecord?.recordId && <small>Record ID: {location.state.serviceRecord.recordId}</small>}
        <div className="saved-actions">
          <Link className="button-link-secondary" to={draft?.vehicleId ? `/vehicles/${draft.vehicleId}/history` : '/vehicles'}>
            View History
          </Link>
          <Link className="button-link" to={addAnotherPath}>
            Add Another
          </Link>
        </div>
      </section>
    </main>
  );
}
