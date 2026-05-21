import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createVehicle, getVehicles } from '../api/vehicles';
import { getActiveCurrentUser, isVehicleOwnerUser } from '../api/currentUser.js';
import {
  clearActiveVehicleSelection,
  setActiveVehicleSelection,
} from '../api/activeVehicle.js';

const emptyVehicle = {
  make: '',
  model: '',
  year: '',
  nickname: '',
  plateNumber: '',
  vinChassisNumber: '',
  odometer: '',
};

function setActiveVehicle(vehicle) {
  setActiveVehicleSelection(vehicle);
}

export default function VehicleProfileSelectionPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(emptyVehicle);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currentUser = getActiveCurrentUser();
  const canManageVehicles = isVehicleOwnerUser(currentUser);

  useEffect(() => {
    let active = true;

    getVehicles()
      .then((data) => {
        if (active) {
          setVehicles(data);
          if (data.length === 0) {
            clearActiveVehicleSelection();
          }
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
  }, []);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleCreateVehicle(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const created = await createVehicle({
        ...form,
        year: form.year ? Number(form.year) : null,
        odometer: form.odometer ? Number(form.odometer) : null,
      });
      setVehicles((current) => [created, ...current]);
      setForm(emptyVehicle);
      setShowCreateForm(false);
      setActiveVehicle(created);
      window.dispatchEvent(new Event('trevora:vehicles-changed'));
      navigate(`/service-input/${created.vehicleId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-header page-header-row">
        <div>
          <p className="eyebrow">Module 1</p>
          <h1>My Vehicles</h1>
          <p>Manage vehicle profiles before creating service drafts.</p>
        </div>
        {canManageVehicles && (
          <button type="button" onClick={() => setShowCreateForm(true)}>
            Add Vehicle
          </button>
        )}
      </section>

      {error && <div className="alert">{error}</div>}

      <section className="vehicle-layout">
        <div>
          <h2>Registered vehicles</h2>
          {loading ? (
            <p className="muted">Loading vehicles...</p>
          ) : !canManageVehicles ? (
            <section className="history-empty-state">
              <h2>Owner approval required</h2>
              <p>Mechanic accounts cannot create vehicle records or service drafts from owner workflows.</p>
            </section>
          ) : vehicles.length === 0 ? (
            <button className="empty-add-card" type="button" onClick={() => setShowCreateForm(true)}>
              <span>+</span>
              <strong>Add New Vehicle</strong>
              <small>Register a vehicle profile to start Module 1.</small>
            </button>
          ) : (
            <div className="vehicle-list">
              {vehicles.map((vehicle) => (
                <article className="vehicle-card" key={vehicle.vehicleId}>
                  <div className="vehicle-card-header">
                    <span className="vehicle-icon">V</span>
                    <div>
                      <h3>{vehicle.nickname || `${vehicle.make} ${vehicle.model}`}</h3>
                      <p>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}</p>
                    </div>
                  </div>

                  <div className="vehicle-stat-grid">
                    <div>
                      <span>Plate number</span>
                      <strong>{vehicle.plateNumber || 'Not provided'}</strong>
                    </div>
                    <div>
                      <span>Odometer</span>
                      <strong>{vehicle.odometer != null ? `${vehicle.odometer.toLocaleString()} km` : 'Not provided'}</strong>
                    </div>
                  </div>

                  <div className="vehicle-detail-grid">
                    <div>
                      <span>Make</span>
                      <strong>{vehicle.make}</strong>
                    </div>
                    <div>
                      <span>Model</span>
                      <strong>{vehicle.model}</strong>
                    </div>
                    <div>
                      <span>Year</span>
                      <strong>{vehicle.year || 'Not provided'}</strong>
                    </div>
                  </div>

                  <div className="card-actions">
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() => {
                        setActiveVehicle(vehicle);
                        navigate(`/vehicles/${vehicle.vehicleId}/history`);
                      }}
                    >
                      View History
                    </button>
                    {canManageVehicles && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveVehicle(vehicle);
                          navigate(`/service-input/${vehicle.vehicleId}`);
                        }}
                      >
                        Add Record
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {canManageVehicles && (
                <button className="empty-add-card compact" type="button" onClick={() => setShowCreateForm(true)}>
                  <span>+</span>
                  <strong>Add New Vehicle</strong>
                  <small>Register another vehicle profile.</small>
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {showCreateForm && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={handleCreateVehicle}>
            <div>
              <h2>Add New Vehicle</h2>
              <p className="muted">Register a vehicle profile before creating service drafts.</p>
            </div>

            <div className="form-grid">
              <label>
                Nickname
                <input name="nickname" value={form.nickname} onChange={updateField} placeholder="Daily driver" />
              </label>
              <label>
                Make
                <input name="make" value={form.make} onChange={updateField} placeholder="Toyota" required />
              </label>
              <label>
                Model
                <input name="model" value={form.model} onChange={updateField} placeholder="Vios" required />
              </label>
              <label>
                Year
                <input name="year" type="number" min="1886" value={form.year} onChange={updateField} placeholder="2021" />
              </label>
              <label>
                Plate number
                <input name="plateNumber" value={form.plateNumber} onChange={updateField} placeholder="ABC 1234" />
              </label>
              <label>
                Current odometer
                <input
                  name="odometer"
                  type="number"
                  min="0"
                  value={form.odometer}
                  onChange={updateField}
                  placeholder="62400"
                />
              </label>
            </div>

            <label>
              VIN / chassis number
              <input name="vinChassisNumber" value={form.vinChassisNumber} onChange={updateField} />
            </label>

            <div className="actions">
              <button className="button-secondary" type="button" onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Vehicle'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
