import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, FileText, Mic, PenLine } from 'lucide-react';
import FlowChrome from '../components/flow/FlowChrome';
import useGarage from '../hooks/useGarage.js';
import { getVehicle } from '../api/vehicles';
import { displayVehicleName } from '../utils/vehicleText';
import { relativeDays } from '../utils/format';

/**
 * Steps 1 and 2 — which vehicle, and how.
 *
 * <p>They stay two screens rather than merging. Step 1 is cheap because it is
 * skipped on the normal way in: entering from a vehicle page starts at step 2
 * with the car already named in the bar. Merging them would put a question the
 * owner has usually already answered in front of the one they came to answer.
 *
 * <p>The method cards no longer carry R / V / M letter tiles. Each says what
 * happens to what you give us, because that is the actual difference between
 * the three — not speed. The recommendation is an outlined word, not a
 * coloured ribbon: chroma is not available for emphasis here.
 */

const methods = [
  {
    key: 'receipt',
    title: 'Photo of the receipt',
    icon: FileText,
    recommended: true,
    body: 'We read the details off it. Multi-page receipts are fine — keep them in printed order.',
    foot: 'Every field will show where its value came from.',
    cta: 'Continue with a photo',
  },
  {
    key: 'voice',
    title: 'Voice note',
    icon: Mic,
    body: 'Say what was done. We write it down, and you can edit every word of it.',
    foot: 'Quickest when you have no paper.',
    cta: 'Continue with a voice note',
  },
  {
    key: 'manual',
    title: 'Type it in',
    icon: PenLine,
    body: 'Your own words. Nothing is read or guessed — what you type is what saves.',
    foot: 'Best for an old record you already know.',
    cta: 'Continue by typing',
  },
];

/** Step 1 — the vehicle, with the numbers that tell them apart. */
function PickVehicle({ navigate }) {
  const { garages, loading, error } = useGarage();
  const [selected, setSelected] = useState('');

  const chosen = garages.find((entry) => entry.vehicle.vehicleId === selected);

  return (
    <FlowChrome
      step={1}
      title="Which vehicle was serviced?"
      subtitle="Step 1 of 6"
      onExit={() => navigate('/')}
    >
      {error && <div className="flow-alert">{error}</div>}

      {loading ? (
        <p className="flow-note">Loading your vehicles…</p>
      ) : garages.length === 0 ? (
        <section className="flow-card" style={{ padding: 26 }}>
          <h2 className="flow-done__title">No vehicles yet</h2>
          <p className="flow-note" style={{ margin: '8px 0 18px' }}>
            Add a vehicle before recording a service against it.
          </p>
          <button className="flow-btn" type="button" onClick={() => navigate('/vehicles/new')}>
            Add a vehicle
          </button>
        </section>
      ) : (
        <>
          <div className="flow-pick">
            {garages.map(({ vehicle, records }) => {
              const isSelected = vehicle.vehicleId === selected;
              return (
                <button
                  className={`flow-pick__card${isSelected ? ' is-selected' : ''}`}
                  type="button"
                  key={vehicle.vehicleId}
                  onClick={() => setSelected(vehicle.vehicleId)}
                  aria-pressed={isSelected}
                >
                  <span className="flow-pick__top">
                    <span>
                      <span className="flow-pick__name">{displayVehicleName(vehicle)}</span>
                      <br />
                      <span className="flow-pick__sub">
                        {[vehicle.plateNumber, vehicle.bodyType].filter(Boolean).join(' · ') || 'Vehicle'}
                      </span>
                    </span>
                    <span className="flow-pick__tick" aria-hidden="true">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  </span>
                  <span className="flow-pick__stats">
                    <span className="flow-stat">
                      <span className="flow-eyebrow">Records</span>
                      <span className="flow-stat__value">{records.length}</span>
                    </span>
                    <span className="flow-stat">
                      <span className="flow-eyebrow">Last</span>
                      <span className="flow-stat__value">
                        {records[0]?.serviceDate ? relativeDays(records[0].serviceDate) : 'None yet'}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flow-actions">
            <p className="flow-note">Entering from a vehicle page? This step is skipped.</p>
            <button
              className="flow-btn"
              type="button"
              disabled={!chosen}
              onClick={() => navigate(`/service-input/${chosen.vehicle.vehicleId}`)}
            >
              Proceed
            </button>
          </div>
        </>
      )}
    </FlowChrome>
  );
}

/** Step 2 — the method. */
function PickMethod({ vehicleId, navigate }) {
  const [vehicle, setVehicle] = useState(null);
  const [selected, setSelected] = useState('receipt');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getVehicle(vehicleId)
      .then((data) => { if (active) { setVehicle(data); setError(''); } })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [vehicleId]);

  const chosen = methods.find((method) => method.key === selected) ?? methods[0];

  return (
    <FlowChrome
      step={2}
      vehicleName={vehicle ? displayVehicleName(vehicle) : ''}
      title="How do you want to add it?"
      subtitle="Step 2 of 6 · you will check everything before it saves, whichever you pick"
      onExit={() => navigate('/')}
    >
      {error && <div className="flow-alert">{error}</div>}

      <div className="flow-methods">
        {methods.map((method) => {
          const Icon = method.icon;
          const isSelected = method.key === selected;
          return (
            <button
              className={`flow-method${isSelected ? ' is-selected' : ''}`}
              type="button"
              key={method.key}
              onClick={() => setSelected(method.key)}
              onDoubleClick={() => navigate(`/service-input/${vehicleId}/${method.key}`)}
              aria-pressed={isSelected}
            >
              <span className="flow-method__top">
                <Icon size={30} strokeWidth={1.5} aria-hidden="true" />
                {method.recommended && <span className="flow-method__rec">Recommended</span>}
              </span>
              <span>
                <span className="flow-method__title">{method.title}</span>
                <br />
                <span className="flow-method__body">{method.body}</span>
              </span>
              <span className="flow-method__spacer" />
              <span className="flow-method__foot">{method.foot}</span>
            </button>
          );
        })}
      </div>

      <div className="flow-actions">
        <button
          className="flow-btn flow-btn--ghost"
          type="button"
          onClick={() => navigate('/service-input')}
        >
          Back
        </button>
        <button
          className="flow-btn"
          type="button"
          onClick={() => navigate(`/service-input/${vehicleId}/${chosen.key}`)}
        >
          {chosen.cta}
        </button>
      </div>
    </FlowChrome>
  );
}

export default function ServiceInputMethodPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();

  return vehicleId
    ? <PickMethod vehicleId={vehicleId} navigate={navigate} />
    : <PickVehicle navigate={navigate} />;
}
