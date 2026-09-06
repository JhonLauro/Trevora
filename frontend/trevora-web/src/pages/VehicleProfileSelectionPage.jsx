import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Eye, Pencil, Plus } from 'lucide-react';
import { createVehicle, getVehicles, patchVehicle } from '../api/vehicles';
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

function vehicleTitle(vehicle) {
  return vehicle.nickname || [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle';
}

function vehicleSubtitle(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle profile';
}

function vehicleFormFrom(vehicle) {
  return {
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    year: vehicle?.year ?? '',
    nickname: vehicle?.nickname || '',
    plateNumber: vehicle?.plateNumber || '',
    vinChassisNumber: vehicle?.vinChassisNumber || '',
    odometer: vehicle?.odometer ?? '',
  };
}

function vehiclePayload(form) {
  return {
    ...form,
    year: form.year ? Number(form.year) : null,
    odometer: form.odometer ? Number(form.odometer) : null,
  };
}

export default function VehicleProfileSelectionPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(emptyVehicle);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [detailVehicle, setDetailVehicle] = useState(null);
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
      const created = await createVehicle(vehiclePayload(form));
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

  function openEditVehicle(vehicle) {
    setEditingVehicle(vehicle);
    setForm(vehicleFormFrom(vehicle));
    setShowCreateForm(false);
    setDetailVehicle(null);
  }

  async function handleUpdateVehicle(event) {
    event.preventDefault();
    if (!editingVehicle) return;
    setSaving(true);
    setError('');

    try {
      /* PATCH, not PUT: this form does not carry the warranty terms, and
         under a replacing PUT it would clear them every time somebody
         corrected a plate here. The page is not currently routed -- see
         planning/DEFERRED.md -- but a dead page that silently destroys data
         is a worse thing to leave lying around than a dead page. */
      const updated = await patchVehicle(editingVehicle.vehicleId, vehiclePayload(form));
      setVehicles((current) => current.map((vehicle) => (
        vehicle.vehicleId === updated.vehicleId ? updated : vehicle
      )));
      if (updated.vehicleId === activeVehicleId) {
        setActiveVehicle(updated);
      }
      setForm(emptyVehicle);
      setEditingVehicle(null);
      window.dispatchEvent(new Event('trevora:vehicles-changed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function closeVehicleModal() {
    setShowCreateForm(false);
    setEditingVehicle(null);
    setDetailVehicle(null);
    setForm(emptyVehicle);
  }

  return (
    <main className="page-shell">
      <section className="page-header page-header-row">
        <div>
          <h1>My Vehicles</h1>
          <p>Manage vehicle profiles before creating service drafts.</p>
        </div>
        {canManageVehicles && (
          <button type="button" onClick={() => {
            setForm(emptyVehicle);
            setEditingVehicle(null);
            setDetailVehicle(null);
            setShowCreateForm(true);
          }}>
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
            <button className="empty-add-card" type="button" onClick={() => {
              setForm(emptyVehicle);
              setShowCreateForm(true);
            }}>
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
                        <h3>{vehicleTitle(vehicle)}</h3>
                        <p>{vehicleSubtitle(vehicle)}</p>
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
                  <div className="vehicle-vin-strip">
                    <span>VIN / chassis</span>
                    <strong>{vehicle.vinChassisNumber || 'Not provided'}</strong>
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
                      onClick={() => setDetailVehicle(vehicle)}
                    >
                      <Eye size={16} aria-hidden="true" />
                      Details
                    </button>
                    {canManageVehicles && (
                      <button
                        className="button-secondary"
                        type="button"
                        onClick={() => openEditVehicle(vehicle)}
                      >
                        <Pencil size={16} aria-hidden="true" />
                        Edit
                      </button>
                    )}
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
                <button className="empty-add-card compact" type="button" onClick={() => {
                  setForm(emptyVehicle);
                  setShowCreateForm(true);
                }}>
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

            <VehicleFormFields form={form} updateField={updateField} />

            <div className="actions">
              <button className="button-secondary" type="button" onClick={closeVehicleModal}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Vehicle'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingVehicle && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={handleUpdateVehicle}>
            <div>
              <h2>Edit Vehicle</h2>
              <p className="muted">Update the identity details mechanics and service records rely on.</p>
            </div>

            <VehicleFormFields form={form} updateField={updateField} />

            <div className="actions">
              <button className="button-secondary" type="button" onClick={closeVehicleModal}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {detailVehicle && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card vehicle-detail-modal">
            <div className="vehicle-detail-modal-header">
              <span className="vehicle-icon">
                <Car size={23} strokeWidth={2.25} aria-hidden="true" />
              </span>
              <div>
                <h2>{vehicleTitle(detailVehicle)}</h2>
                <p className="muted">{vehicleSubtitle(detailVehicle)}</p>
              </div>
            </div>

            <dl className="vehicle-full-detail-grid">
              <div><dt>Plate number</dt><dd>{detailVehicle.plateNumber || 'Not provided'}</dd></div>
              <div><dt>VIN / chassis</dt><dd>{detailVehicle.vinChassisNumber || 'Not provided'}</dd></div>
              <div><dt>Current odometer</dt><dd>{detailVehicle.odometer != null ? `${detailVehicle.odometer.toLocaleString()} km` : 'Not provided'}</dd></div>
              <div><dt>Make</dt><dd>{detailVehicle.make || 'Not provided'}</dd></div>
              <div><dt>Model</dt><dd>{detailVehicle.model || 'Not provided'}</dd></div>
              <div><dt>Year</dt><dd>{detailVehicle.year || 'Not provided'}</dd></div>
            </dl>

            <div className="actions">
              <button className="button-secondary" type="button" onClick={closeVehicleModal}>
                Close
              </button>
              {canManageVehicles && (
                <button type="button" onClick={() => openEditVehicle(detailVehicle)}>
                  Edit Vehicle
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function VehicleFormFields({ form, updateField }) {
  return (
    <>
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
    </>
  );
}
