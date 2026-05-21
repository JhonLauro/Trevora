import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Plus } from 'lucide-react';
import { createVehicle, getVehicles } from '../api/vehicles';
import { getActiveCurrentUser, isVehicleOwnerUser } from '../api/currentUser.js';
import {
  clearActiveVehicleSelection,
  getActiveVehicleId,
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
  const activeVehicleId = getActiveVehicleId();

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
              <span>
                <Plus size={24} aria-hidden="true" />
              </span>
              <strong>Add New Vehicle</strong>
              <small>Register a vehicle profile to start adding service records.</small>
            </button>
          ) : (
            <div className="vehicle-list">
              {vehicles.map((vehicle) => (
                <article
                  className={`vehicle-card ${vehicle.vehicleId === activeVehicleId ? 'vehicle-card-active' : ''}`}
                  key={vehicle.vehicleId}
                >
                  <div className="vehicle-card-header">
                    <div className="vehicle-card-title">
                      <span className="vehicle-icon">
                        <Car size={23} strokeWidth={2.25} aria-hidden="true" />
                      </span>
                      <div>
                        <h3>{vehicle.nickname || `${vehicle.make} ${vehicle.model}`}</h3>
                        <p>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}</p>
                      </div>
                    </div>
                    {vehicle.vehicleId === activeVehicleId && <span className="vehicle-active-badge">Active</span>}
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
                  <span>
                    <Plus size={24} aria-hidden="true" />
                  </span>
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
                Vehicle nickname
                <input name="nickname" value={form.nickname} onChange={updateField} placeholder="Ex. Daily driver" />
              </label>
              <label>
                Vehicle brand
                <input name="make" value={form.make} onChange={updateField} placeholder="Ex. Toyota" required />
              </label>
              <label>
                Vehicle model
                <input name="model" value={form.model} onChange={updateField} placeholder="Ex. Vios" required />
              </label>
              <label>
                Model year
                <input name="year" type="number" min="1886" value={form.year} onChange={updateField} placeholder="Ex. 2021" />
              </label>
              <label>
                Plate number
                <input name="plateNumber" value={form.plateNumber} onChange={updateField} placeholder="Ex. ABC 1234" />
              </label>
              <label>
                Current mileage
                <input
                  name="odometer"
                  type="number"
                  min="0"
                  value={form.odometer}
                  onChange={updateField}
                  placeholder="Ex. 62400"
                />
              </label>
            </div>

            <label>
              VIN / chassis number
              <input
                name="vinChassisNumber"
                value={form.vinChassisNumber}
                onChange={updateField}
                placeholder="Ex. MR053HY9300000000"
              />
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
