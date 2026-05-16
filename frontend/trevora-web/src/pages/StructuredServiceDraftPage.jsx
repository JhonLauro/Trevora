import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getServiceDraft } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

const labels = [
  ['serviceDate', 'Service date'],
  ['serviceType', 'Service type'],
  ['odometer', 'Odometer'],
  ['totalCost', 'Total cost'],
  ['shopName', 'Shop / mechanic'],
  ['location', 'Location'],
  ['partsReplaced', 'Parts replaced'],
  ['laborPerformed', 'Labor performed'],
  ['remarks', 'Remarks'],
];

export default function StructuredServiceDraftPage() {
  const { draftId } = useParams();
  const [draft, setDraft] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getServiceDraft(draftId)
      .then((data) => {
        if (active) {
          setDraft(data);
          setError('');
        }
        return getVehicle(data.vehicleId);
      })
      .then((data) => {
        if (active) setVehicle(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [draftId]);

  const confidence = draft?.fieldMetadata?.confidence ?? null;

  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="eyebrow">Structured draft</p>
        <h1>Structured Service Draft</h1>
        <p>This is the unified draft format created from the selected input method.</p>
      </section>

      {loading && <p className="muted">Loading draft...</p>}
      {error && <div className="alert">{error}</div>}

      {draft && (
        <section className="content-two">
          <div className="panel record-panel">
            <div className="draft-toolbar">
              <span className="badge">{draft.inputMethod}</span>
              <span className="badge subtle">{draft.status}</span>
            </div>

            <div className="draft-vehicle-card">
              <span className="vehicle-icon">V</span>
              <div>
                <h2>{vehicle ? vehicle.nickname || `${vehicle.make} ${vehicle.model}` : 'Selected vehicle'}</h2>
                <p>
                  {vehicle
                    ? `${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}${
                        vehicle.plateNumber ? ` - ${vehicle.plateNumber}` : ''
                      }`
                    : draft.vehicleId}
                </p>
              </div>
            </div>

            <dl className="draft-list">
              {labels.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{draft[key] || 'Not provided'}</dd>
                </div>
              ))}
            </dl>

            <div className="actions">
              <Link className="secondary-link" to="/vehicles">
                Back to vehicles
              </Link>
            </div>
          </div>

          <aside className="guidance-stack">
            <section className="helper-card">
              <h2>Draft source</h2>
              <dl className="compact-facts">
                <div>
                  <dt>Input method</dt>
                  <dd>{draft.inputMethod}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{draft.fieldMetadata?.source || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{draft.status}</dd>
                </div>
              </dl>
            </section>

            {confidence && (
              <section className="helper-card">
                <h2>Confidence</h2>
                <div className="confidence-list">
                  {Object.entries(confidence).map(([key, value]) => (
                    <div key={key}>
                      <span>{key}</span>
                      <strong>{Math.round(Number(value) * 100)}%</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {draft.fieldMetadata && (
              <section className="metadata-box">
                <h2>Source metadata</h2>
                <pre>{JSON.stringify(draft.fieldMetadata, null, 2)}</pre>
              </section>
            )}
          </aside>
        </section>
      )}
    </main>
  );
}
