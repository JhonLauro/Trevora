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
  },
  {
    key: 'voice',
    title: 'Voice note',
    icon: Mic,
    body: 'Say what was done. We write it down, and you can edit every word of it.',
    foot: 'Quickest when you have no paper.',
  },
  {
    key: 'manual',
    title: 'Type it in',
    icon: PenLine,
    body: 'Your own words. Nothing is read or guessed — what you type is what saves.',
    foot: 'Best for an old record you already know.',
  },
];

/** Step 1 — the vehicle, with the numbers that tell them apart. */
function PickVehicle({ navigate }) {
  const { garages, loading, error } = useGarage();


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
              return (
                <button
                    className="flow-pick__card"
                    type="button"
                    key={vehicle.vehicleId}
                    onClick={() => navigate(`/service-input/${vehicle.vehicleId}`)}
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
              {/* Same reasoning as the method step. This one had nothing
                  selected by default and Proceed was disabled until you
                  picked, so it cost everybody two clicks to answer one
                  question: which car. */}
          </div>
        </>
      )}
    </FlowChrome>
  );
}

/** Step 2 — the method. */
function PickMethod({ vehicleId, navigate }) {
  const [vehicle, setVehicle] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getVehicle(vehicleId)
      .then((data) => { if (active) { setVehicle(data); setError(''); } })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [vehicleId]);


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
          return (
            <button
              className="flow-method"
              type="button"
              /* One anchor per card, not one around all three. They sit in a
                 row on a desktop but stack into a column on a phone, where a
                 single spotlight over the group would be a box taller than the
                 screen with nowhere left to put the card explaining it. */
              data-tip={`method-${method.key}`}
              key={method.key}
              onClick={() => navigate(`/service-input/${vehicleId}/${method.key}`)}
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
        {/* No confirm button.

            Choosing a method and then confirming it was two actions for one
            decision, and the decision is free to change -- Back sits on the
            next screen and nothing has been entered yet. The card is the
            choice now.

            The double-click shortcut that used to do this went with it:
            nobody double-clicks a card on the web, so it was a path only
            its author knew about. */}
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
