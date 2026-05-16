import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import StepIndicator from '../components/StepIndicator';
import { getVehicle } from '../api/vehicles';

const methods = [
  {
    key: 'receipt',
    title: 'Receipt / Photo',
    badge: 'Recommended',
    icon: 'R',
    description: 'Upload a receipt image. Mock OCR extracts draft fields for review.',
    meta: 'Best accuracy when a receipt is available.',
  },
  {
    key: 'voice',
    title: 'Voice Note',
    badge: 'Quick entry',
    icon: 'V',
    description: 'Enter spoken-service text. Mock voice processing structures the draft.',
    meta: 'Useful when you remember the service details.',
  },
  {
    key: 'manual',
    title: 'Manual Entry',
    badge: 'Owner verified',
    icon: 'M',
    description: 'Type the service details yourself. No AI extraction is applied.',
    meta: 'Most precise when you have the fields ready.',
  },
];

export default function ServiceInputMethodPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    window.localStorage.setItem('trevora.activeVehicleId', vehicleId);

    getVehicle(vehicleId)
      .then((data) => {
        if (active) {
          setVehicle(data);
          setError('');
        }
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
  }, [vehicleId]);

  return (
    <main className="page-shell">
      <section className="page-header page-header-row">
        <div>
          <p className="eyebrow">
            <Link className="inline-link" to="/vehicles">
              Back to vehicles
            </Link>
            <span>Module 1</span>
          </p>
          <h1>Add Service Record</h1>
          <p>
            {loading
              ? 'Loading selected vehicle...'
              : vehicle
                ? `Choose how to capture service details for ${vehicle.nickname || `${vehicle.make} ${vehicle.model}`}.`
                : 'Choose a vehicle before adding a service record.'}
          </p>
        </div>
      </section>

      <StepIndicator currentStep={2} />

      {error && <div className="alert">{error}</div>}

      <section className="method-grid">
        {methods.map((method) => (
          <button
            className="method-card"
            disabled={loading || Boolean(error)}
            key={method.key}
            onClick={() => navigate(`/service-input/${vehicleId}/${method.key}`)}
            type="button"
          >
            <span className="method-topline">
              <span className="method-icon">{method.icon}</span>
              <span className="method-badge">{method.badge}</span>
            </span>
            <strong>{method.title}</strong>
            <span>{method.description}</span>
            <small>{method.meta}</small>
          </button>
        ))}
      </section>

      <section className="panel flow-panel">
        <p className="eyebrow">Module 1 flow</p>
        <div className="flow-steps">
          <span>Select vehicle</span>
          <span>Choose input method</span>
          <span>Create structured draft</span>
        </div>
      </section>
    </main>
  );
}
