import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StoredReceiptPreview from '../components/StoredReceiptPreview';
import { getVehicleServiceRecord } from '../api/serviceHistory';
import { getVehicle } from '../api/vehicles';
import AIExplanationPanel from '../components/AIExplanationPanel';

function vehicleName(vehicle, record) {
  if (vehicle) return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  return record?.vehicleId ?? 'Selected vehicle';
}

function vehicleSubtitle(vehicle) {
  if (!vehicle) return '';
  return `${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}${
    vehicle.plateNumber ? ` - ${vehicle.plateNumber}` : ''
  }`;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  return `PHP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return 'No date';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sourceLabel(record) {
  if (!record) return 'Service record';
  const source = record.sourceInputMethod === 'RECEIPT' ? 'Receipt' : record.sourceInputMethod === 'VOICE' ? 'Voice' : 'Manual';
  return `${source} source`;
}

const detailFields = [
  ['serviceDate', 'Service Date', (record) => formatDate(record.serviceDate)],
  ['odometer', 'Odometer at Service', (record) => (record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'Not provided')],
  ['serviceType', 'Service Type', (record) => record.serviceType],
  ['category', 'Category', (record) => record.category],
  ['partsReplaced', 'Parts Replaced', (record) => record.partsReplaced || 'Not provided'],
  ['laborPerformed', 'Work Performed', (record) => record.laborPerformed || 'Not provided'],
  ['shopName', 'Shop / Mechanic', (record) => record.shopName || 'Not provided'],
  ['location', 'Shop Location', (record) => record.location || 'Not provided'],
  ['totalCost', 'Total Cost', (record) => formatMoney(record.totalCost)],
  ['remarks', 'Remarks', (record) => record.remarks || 'Not provided'],
];

export default function ServiceRecordDetailPage() {
  const { vehicleId, recordId } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    window.localStorage.setItem('trevora.activeVehicleId', vehicleId);
  }, [vehicleId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([
      getVehicle(vehicleId),
      getVehicleServiceRecord(vehicleId, recordId),
    ])
      .then(([vehicleData, recordData]) => {
        if (!active) return;
        setVehicle(vehicleData);
        setRecord(recordData);
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
  }, [vehicleId, recordId]);

  return (
    <main className="page-shell module-three-page">
      <section className="record-detail-topbar">
        <Link className="inline-link" to={`/vehicles/${vehicleId}/history`}>
          Back to History
        </Link>
        <Link className="inline-link" to={`/vehicles/${vehicleId}/share`}>
          Share Access
        </Link>
      </section>

      {loading && <p className="muted">Loading service record...</p>}
      {error && <div className="alert">{error}</div>}

      {record && (
        <>
          <section className="record-detail-header">
            <div>
              <h1>{record.serviceType}</h1>
              <p>
                {vehicleName(vehicle, record)} · {formatDate(record.serviceDate)}
              </p>
              <div className="record-detail-badges">
                <span className="badge">Validated</span>
                <span className="badge subtle">{sourceLabel(record)}</span>
                <span className="badge subtle">AI explanation</span>
              </div>
            </div>
          </section>

          <section className="record-detail-layout">
            <article className="record-detail-card">
              <div className="record-detail-card-header">
                <h2>Record Details</h2>
                <span>From: {sourceLabel(record)}</span>
              </div>

              <div className="record-field-list">
                <div className="record-field-row">
                  <span className="record-field-icon">V</span>
                  <div>
                    <span>Vehicle</span>
                    <strong>{vehicleName(vehicle, record)}</strong>
                    {vehicleSubtitle(vehicle) && <small>{vehicleSubtitle(vehicle)}</small>}
                  </div>
                  <span className="field-confidence-badge field-confidence-high">Verified</span>
                </div>

                {detailFields.map(([key, label, getValue]) => (
                  <div className="record-field-row" key={key}>
                    <span className="record-field-icon">{label.charAt(0)}</span>
                    <div>
                      <span>{label}</span>
                      <strong>{getValue(record)}</strong>
                    </div>
                    <span className="field-confidence-badge field-confidence-high">Confirmed</span>
                  </div>
                ))}
              </div>
            </article>

            <aside className="record-detail-side">
              <AIExplanationPanel recordId={record.recordId} />

              {record.receiptStoragePath && (
                <section className="record-source-card">
                  <StoredReceiptPreview source={record} title="Stored receipt" />
                </section>
              )}

              <section className="record-source-card">
                <h2>Source Reference</h2>
                <dl className="compact-facts">
                  <div>
                    <dt>Source</dt>
                    <dd>{sourceLabel(record)}</dd>
                  </div>
                  <div>
                    <dt>Record ID</dt>
                    <dd>{record.recordId}</dd>
                  </div>
                  <div>
                    <dt>Draft trace</dt>
                    <dd>{record.draftId}</dd>
                  </div>
                  <div>
                    <dt>Saved</dt>
                    <dd>{record.createdAt ? new Date(record.createdAt).toLocaleString() : 'Not provided'}</dd>
                  </div>
                </dl>
              </section>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}
