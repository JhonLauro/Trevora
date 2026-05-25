import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';
import { createManualServiceDraft } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

const emptyDraft = {
  serviceDate: '',
  serviceType: '',
  odometer: '',
  totalCost: '',
  shopName: '',
  location: '',
  partsReplaced: '',
  laborPerformed: '',
  remarks: '',
};

export default function ManualEntryPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [form, setForm] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

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

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const draft = await createManualServiceDraft({
        ...form,
        vehicleId,
        odometer: form.odometer ? Number(form.odometer) : null,
        totalCost: Number(form.totalCost),
      });
      navigate(`/service-drafts/${draft.draftId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="eyebrow">
          <Link className="inline-link" to="/vehicles">
            Change method
          </Link>
          <span>Manual</span>
        </p>
        <h1>Add Service Record</h1>
        {loading ? (
          <p>Loading selected vehicle...</p>
        ) : vehicle ? (
          <p>
            Drafting for {vehicle.nickname || `${vehicle.make} ${vehicle.model}`}
            {vehicle.plateNumber ? ` - ${vehicle.plateNumber}` : ''}
          </p>
        ) : null}
      </section>

      <StepIndicator currentStep={3} />

      {error && <div className="alert">{error}</div>}

      <section className="content-two">
        <form className="panel record-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <div>
              <h2>Enter service details</h2>
              <p>Manual entries are marked owner-verified for this draft.</p>
            </div>
            <span className="method-badge">Owner verified</span>
          </div>

          <div className="form-grid">
            <label>
              Service date
              <input
                name="serviceDate"
                type="date"
                value={form.serviceDate}
                onChange={updateField}
                required
              />
            </label>
            <label>
              Service type
              <input
                name="serviceType"
                value={form.serviceType}
                onChange={updateField}
                placeholder="Oil change, brake repair, tune-up"
              />
            </label>
            <label>
              Odometer
              <input name="odometer" type="number" min="0" value={form.odometer} onChange={updateField} />
            </label>
            <label>
              Total cost
              <input
                name="totalCost"
                type="number"
                min="0"
                step="0.01"
                value={form.totalCost}
                onChange={updateField}
                required
              />
            </label>
            <label>
              Shop Name
              <input name="shopName" value={form.shopName} onChange={updateField} />
            </label>
            <label>
              Location
              <input name="location" value={form.location} onChange={updateField} />
            </label>
          </div>

          <label>
            Parts replaced
            <textarea name="partsReplaced" value={form.partsReplaced} onChange={updateField} rows="3" />
          </label>
          <label>
            Labor performed
            <textarea name="laborPerformed" value={form.laborPerformed} onChange={updateField} rows="3" />
          </label>
          <label>
            Remarks
            <textarea name="remarks" value={form.remarks} onChange={updateField} rows="3" />
          </label>

          <div className="actions">
            <Link className="secondary-link" to={`/service-input/${vehicleId}`}>
              Change method
            </Link>
            <button type="submit" disabled={saving || loading}>
              {saving ? 'Creating draft...' : 'Create service draft'}
            </button>
          </div>
        </form>

        <aside className="guidance-stack">
          <section className="helper-card">
            <h2>Required for manual</h2>
            <ul className="check-list">
              <li>Service date</li>
              <li>Total cost</li>
            </ul>
          </section>
          <section className="helper-card success">
            <h2>No AI processing</h2>
            <p>Manual drafts skip OCR and voice processing. The entered fields go straight into the structured ServiceDraft.</p>
          </section>
        </aside>
      </section>
    </main>
  );
}
