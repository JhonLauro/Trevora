import { useNavigate, useParams } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Car, CheckCircle2 } from 'lucide-react';
import StepIndicator from '../components/StepIndicator';
import {
  clearActiveVehicleSelection,
  displayVehicleName,
  displayVehicleSubtitle,
  getActiveVehicleId,
  setActiveVehicleSelection,
} from '../api/activeVehicle.js';
import { getVehicle, getVehicles } from '../api/vehicles';

const methods = [
  {
    key: 'receipt',
    title: 'Receipt / Photo',
    badge: 'Recommended',
    icon: 'R',
    description: 'Upload a receipt image. Tesseract OCR and AI extraction create a draft for review.',
    meta: 'Best with clear receipt photos.',
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
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(() => getActiveVehicleId() || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    if (!vehicleId) {
      setLoading(true);
      getVehicles()
        .then((data) => {
          if (!active) return;
          setVehicles(data);
          setVehicle(null);
          setSelectedVehicleId((current) => {
            if (current && data.some((item) => item.vehicleId === current)) return current;
            return '';
          });
          if (data.length === 0) {
            clearActiveVehicleSelection();
          }
          setError('');
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
    }

    getVehicle(vehicleId)
      .then((data) => {
        if (active) {
          setVehicle(data);
          setActiveVehicleSelection(data);
          setError('');
        }
      })
      .catch((err) => {
        if (active) {
          clearActiveVehicleSelection();
          setError(err.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [vehicleId]);

  function handleSelectVehicle(selectedVehicle) {
    setSelectedVehicleId(selectedVehicle.vehicleId);
    setActiveVehicleSelection(selectedVehicle);
    window.dispatchEvent(new Event('trevora:vehicles-changed'));
  }

  function handleProceed() {
    const selectedVehicle = vehicles.find((item) => item.vehicleId === selectedVehicleId);
    if (selectedVehicle) {
      setActiveVehicleSelection(selectedVehicle);
      window.dispatchEvent(new Event('trevora:vehicles-changed'));
      navigate(`/service-input/${selectedVehicle.vehicleId}`);
    }
  }

  if (!vehicleId) {
    const selectedVehicle = vehicles.find((item) => item.vehicleId === selectedVehicleId);

    return (
      <main className="page-shell">
        <section className="page-header page-header-row">
          <div>
            <h1>Add Service Record</h1>
            <p>Select the vehicle profile that this service record belongs to.</p>
          </div>
        </section>

        <StepIndicator currentStep={1} />

        {error && <div className="alert">{error}</div>}

        {loading ? (
          <p className="muted">Loading vehicle profiles...</p>
        ) : vehicles.length === 0 ? (
          <section className="history-empty-state">
            <h2>No vehicle profiles yet</h2>
            <p>Add a vehicle before creating a service record.</p>
            <button type="button" onClick={() => navigate('/vehicles')}>
              Add Vehicle
            </button>
          </section>
        ) : (
          <>
            <section className="service-selection-panel">
              <div className="service-selection-heading">
                <div>
                  <p className="eyebrow">Vehicle profiles</p>
                  <h2>Choose one vehicle</h2>
                  <p>Only records for the selected vehicle will be created in the next steps.</p>
                </div>
                <span>{vehicles.length} registered</span>
              </div>

              <div className="service-vehicle-grid" aria-label="Select vehicle for service record">
                {vehicles.map((item) => {
                  const selected = item.vehicleId === selectedVehicleId;
                  return (
                    <button
                      className={`service-vehicle-option ${selected ? 'selected' : ''}`}
                      key={item.vehicleId}
                      type="button"
                      onClick={() => handleSelectVehicle(item)}
                    >
                      <span className="service-vehicle-icon">
                        <Car size={24} strokeWidth={2.2} aria-hidden="true" />
                      </span>
                      <span className="service-vehicle-copy">
                        <strong>{displayVehicleName(item)}</strong>
                        <small>{displayVehicleSubtitle(item)}</small>
                        <span className="service-vehicle-meta">
                          {[item.year, item.make, item.model].filter(Boolean).join(' ') || 'Vehicle profile'}
                        </span>
                      </span>
                      <span className="service-vehicle-status">
                        {selected ? (
                          <>
                            <CheckCircle2 size={16} aria-hidden="true" />
                            Selected
                          </>
                        ) : (
                          'Select'
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="service-input-action-bar">
                <div>
                  <span>Ready for next step</span>
                  <strong>{selectedVehicle ? displayVehicleName(selectedVehicle) : 'No vehicle selected'}</strong>
                </div>
                <button type="button" disabled={!selectedVehicleId} onClick={handleProceed}>
                  Proceed
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="page-header page-header-row">
        <div>
          <h1>Add Service Record</h1>
          <p>
            {loading
              ? 'Loading selected vehicle...'
              : vehicle
                ? `Choose how to capture service details for ${vehicle.nickname || `${vehicle.make} ${vehicle.model}`}.`
                : 'Choose a vehicle before adding a service record.'}
              </p>
        </div>
        <button className="button-secondary back-step-button" type="button" onClick={() => navigate('/service-input')}>
          <ArrowLeft size={18} aria-hidden="true" />
          Back to Select Vehicle
        </button>
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
    </main>
  );
}
