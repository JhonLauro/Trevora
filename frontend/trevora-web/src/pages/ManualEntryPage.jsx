import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FlowChrome from '../components/flow/FlowChrome';
import ServiceLinesEditor from '../components/flow/ServiceLinesEditor';
import { createManualServiceDraft, primeServiceDraftReview } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';
import { formatPeso, lineEntriesOf, pesosFromCentavos, reconciliation } from '../utils/serviceLines';

/**
 * Step 3c. The plainest of the three, and the only one where nothing is read
 * or guessed — so no field here ever carries a confidence badge. What the
 * owner types is what saves.
 */

const emptyDraft = {
  serviceDate: '',
  odometer: '',
  totalCost: '',
  shopName: '',
  location: '',
  remarks: '',
  services: [],
};

const fields = [
  ['serviceDate', 'Date of service', 'date', true, ''],
  ['odometer', 'Odometer', 'number', false, 'Kilometres, if you noted it'],
  ['totalCost', 'Total cost', 'number', true, '0.00'],
  ['shopName', 'Shop name', 'text', false, 'Who did the work'],
  ['location', 'Location', 'text', false, 'Where they are'],
  ['remarks', 'Remarks', 'textarea', false, 'Anything worth remembering'],
];

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

  function updateServices(services) {
    setForm((current) => ({ ...current, services }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    // The review screen is a lazy route; start its chunk now so it downloads
    // alongside the save rather than after it.
    import('./ServiceDraftReviewPage.jsx').catch(() => {});

    try {
      const draft = await createManualServiceDraft({
        ...form,
        vehicleId,
        odometer: form.odometer ? Number(form.odometer) : null,
        totalCost: Number(form.totalCost),
        services: (form.services || []).map((item, index) => ({
          ...item,
          serviceType: item.serviceType?.trim() || '',
          partsReplaced: item.partsReplaced?.trim() || '',
          laborPerformed: item.laborPerformed?.trim() || '',
          lineCost: item.lineCost === '' || item.lineCost === undefined ? null : Number(item.lineCost),
          sortOrder: index,
        })),
      });
      // No hand-off animation here, unlike the receipt and voice routes: this
      // is a plain POST of what the owner already typed, and there is no wait
      // to cover. Two seconds of transition on an instant save is two seconds
      // of nothing. The prime still earns its place — it overlaps the review
      // request with the lazy route resolving.
      primeServiceDraftReview(draft.draftId);
      navigate(`/service-drafts/${draft.draftId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const vehicleName = vehicle
    ? vehicle.nickname || `${vehicle.make} ${vehicle.model}`
    : '';

  const balance = reconciliation(form.services, form.totalCost);
  const hasLines = (form.services || []).some((item) => lineEntriesOf(item).length > 0);

  return (
    <FlowChrome
      step={3}
      width="mid"
      vehicleName={vehicleName}
      title="Type in the details"
      subtitle="Only the date and the total are required."
      onExit={() => navigate('/')}
    >
      {error && <div className="flow-alert">{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div className="flow-grid" data-tip="manual-fields">
          {fields.map(([key, label, type, required, placeholder]) => (
            <label className="flow-field" key={key}>
              <span>{label}{required ? ' *' : ''}</span>
              {type === 'textarea' ? (
                <textarea
                  name={key}
                  value={form[key]}
                  onChange={updateField}
                  placeholder={placeholder}
                  rows="3"
                />
              ) : (
                <input
                  name={key}
                  type={type}
                  min={type === 'number' ? '0' : undefined}
                  step={key === 'totalCost' ? '0.01' : undefined}
                  value={form[key]}
                  onChange={updateField}
                  placeholder={placeholder}
                  required={required}
                />
              )}
            </label>
          ))}
        </div>

        <section className="flow-card" data-tip="manual-lines">
          <div className="flow-done__head">
            <div>
              <h2 className="flow-done__title">What was done</h2>
              <p className="flow-note">A service, then the lines that paid for it.</p>
            </div>
          </div>

          <ServiceLinesEditor value={form.services} onChange={updateServices} />

          {hasLines && (
            <div className="flow-done__total">
              <span className="flow-note">Lines add up to</span>
              <span className="flow-done__total-value">
                {formatPeso(pesosFromCentavos(balance.lineSum)) ?? '—'}
              </span>
            </div>
          )}
        </section>

        <div className="flow-actions">
          <button
            className="flow-btn flow-btn--ghost"
            type="button"
            onClick={() => navigate(`/service-input/${vehicleId}`)}
          >
            Back
          </button>
          <button className="flow-btn" type="submit" disabled={saving || loading}>
            {saving ? 'Creating draft…' : 'Check the details'}
          </button>
        </div>
      </form>
    </FlowChrome>
  );
}
