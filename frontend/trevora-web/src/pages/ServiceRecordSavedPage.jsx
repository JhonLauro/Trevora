import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import FlowChrome from '../components/flow/FlowChrome';
import { getServiceDraft } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';
import VehicleDetailsOffer from '../components/flow/VehicleDetailsOffer.jsx';
import { getVehicleServiceHistory } from '../api/serviceHistory';
import { formatDay } from '../utils/format';
import { serviceItemsArray } from '../utils/serviceText';
import { lineEntriesOf } from '../utils/serviceLines';

/**
 * Step 6. The one screen in the flow that can tell the owner something they
 * did not already know: what this record closed.
 *
 * <p>Everything else here they typed or checked a moment ago. So the three
 * figures are about the collection, not about the record — how many records
 * this car now has, whether the receipt was kept, and what the visit covered.
 */

function vehicleName(vehicle, draft) {
  if (!vehicle) return draft?.vehicleId ?? 'this vehicle';
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

/** "Oil change and oil filter", from the services actually saved. */
function whatWasDone(draft) {
  const names = serviceItemsArray(draft?.services)
    .map((item) => String(item.serviceType ?? '').trim())
    .filter(Boolean);
  if (names.length === 0) return 'Service recorded';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function ServiceRecordSavedPage() {
  const { draftId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(location.state?.draft ?? null);
  const [vehicle, setVehicle] = useState(null);
  const [recordCount, setRecordCount] = useState(null);
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
        // The count is the point of this screen, so it is fetched rather than
        // guessed. A failure here costs one figure, not the screen.
        try {
          const history = await getVehicleServiceHistory(draftData.vehicleId, { sort: 'newest' });
          if (active) setRecordCount((history.records ?? []).length);
        } catch {
          if (active) setRecordCount(null);
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      });

    return () => {
      active = false;
    };
  }, [draft, draftId]);

  const recordId = location.state?.serviceRecord?.recordId;
  const pageCount = Number(draft?.fieldMetadata?.pageCount) || 0;
  const lineCount = serviceItemsArray(draft?.services)
    .reduce((sum, item) => sum + lineEntriesOf(item).length, 0);

  const subtitle = draft
    ? [
      whatWasDone(draft),
      formatDay(draft.serviceDate, ''),
      [draft.shopName, draft.location].filter(Boolean).join(', '),
    ].filter(Boolean).join(' · ')
    : '';

  return (
    <FlowChrome step={6} vehicleName={vehicleName(vehicle, draft)} onExit={() => navigate('/')}>
      {error && <div className="flow-alert">{error}</div>}

      <div className="flow-saved__head">
        <span className="flow-saved__tick" aria-hidden="true">
          <Check size={22} strokeWidth={2.2} />
        </span>
        <div>
          <h1 className="flow-saved__title">Saved to your records</h1>
          <p className="flow-saved__sub">{subtitle}</p>
        </div>
      </div>

      <section className="flow-card flow-saved__stats">
        <div className="flow-saved__stat">
          <span className="flow-eyebrow">Records for this car</span>
          <span className="flow-saved__stat-value">
            {recordCount === null ? '—' : recordCount}
          </span>
        </div>
        <div className="flow-saved__stat">
          <span className="flow-eyebrow">What was charged</span>
          <span className="flow-saved__stat-value">
            {lineCount > 0 ? `${lineCount} line${lineCount === 1 ? '' : 's'} kept` : 'Total only'}
          </span>
        </div>
        <div className="flow-saved__stat">
          <span className="flow-eyebrow">Receipt</span>
          <span className="flow-saved__stat-value">
            {pageCount > 0
              ? `${pageCount} page${pageCount === 1 ? '' : 's'} kept`
              : draft?.receiptStoragePath ? 'Kept' : 'None'}
          </span>
        </div>
      </section>

      {/* Asked here rather than during review. It is an errand about the
          vehicle profile, not about the record just filed, and it arrives once
          somebody has finished what they came to do. Its sibling -- the
          "this may be the wrong vehicle" warning -- stayed on the review
          screen, because that one has to be caught before the record exists. */}
      <VehicleDetailsOffer draft={draft} vehicle={vehicle} onVehicleUpdated={setVehicle} />

      <div className="flow-saved__actions">
        <button
          className="flow-btn"
          type="button"
          disabled={!recordId || !draft?.vehicleId}
          onClick={() => navigate(`/vehicles/${draft.vehicleId}/history/${recordId}`)}
        >
          View this record
        </button>
        <button
          className="flow-btn flow-btn--ghost"
          type="button"
          onClick={() => navigate(draft?.vehicleId ? `/service-input/${draft.vehicleId}` : '/service-input')}
        >
          Add another
        </button>
        <button
          className="flow-btn flow-btn--ghost"
          type="button"
          onClick={() => navigate(draft?.vehicleId ? `/vehicles/${draft.vehicleId}` : '/')}
        >
          Back to the car
        </button>
      </div>
    </FlowChrome>
  );
}
