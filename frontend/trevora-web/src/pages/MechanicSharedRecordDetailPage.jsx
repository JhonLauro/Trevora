import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMechanicSessionRecord } from '../api/mechanicAccess';

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  return `PHP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return 'No date';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const detailFields = [
  ['serviceDate', 'Service Date', (record) => formatDate(record.serviceDate)],
  ['odometer', 'Odometer', (record) => (record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'Not provided')],
  ['serviceType', 'Service Type', (record) => record.serviceType],
  ['category', 'Category', (record) => record.category],
  ['partsReplaced', 'Parts Replaced', (record) => record.partsReplaced || 'Not provided'],
  ['laborPerformed', 'Work Performed', (record) => record.laborPerformed || 'Not provided'],
  ['shopName', 'Shop / Mechanic', (record) => record.shopName || 'Not provided'],
  ['location', 'Location', (record) => record.location || 'Not provided'],
  ['totalCost', 'Total Cost', (record) => formatMoney(record.totalCost)],
  ['remarks', 'Remarks', (record) => record.remarks || 'Not provided'],
];

export default function MechanicSharedRecordDetailPage() {
  const { sessionId, recordId } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getMechanicSessionRecord(sessionId, recordId)
      .then((data) => {
        if (active) setDetail(data);
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
  }, [sessionId, recordId]);

  const record = detail?.record;

  return (
    <main className="page-shell mechanic-shared-page">
      <div className="mechanic-detail-nav">
        <Link className="inline-link" to={`/mechanic/access/${sessionId}`}>
          Back to shared records
        </Link>
        <Link className="owner-return-link owner-return-link-inline" to="/login">
          Back to owner sign in
        </Link>
      </div>

      {loading && <p className="muted">Loading read-only record...</p>}
      {error && <BlockedAccessMessage message={error} />}

      {record && (
        <>
          <section className="readonly-mode-banner">
            <span>Read-only</span>
            <p>You are viewing an owner-approved shared record. No changes can be made here.</p>
          </section>

          <section className="record-detail-header mechanic-detail-header">
            <div>
              <h1>{record.serviceType}</h1>
              <p>
                {formatDate(record.serviceDate)} - {detail.vehicleLabel}
              </p>
              <div className="record-detail-badges">
                <span className="badge">Verified</span>
                <span className="badge subtle">{record.sourceInputMethod}</span>
              </div>
            </div>
          </section>

          <article className="record-detail-card mechanic-detail-card">
            <div className="record-detail-card-header">
              <h2>Record Details</h2>
              <span>Temporary read-only access</span>
            </div>
            <div className="record-field-list">
              <div className="record-field-row">
                <span className="record-field-icon">V</span>
                <div>
                  <span>Vehicle</span>
                  <strong>{detail.vehicleLabel}</strong>
                </div>
                <span className="field-confidence-badge field-confidence-high">Shared</span>
              </div>
              {detailFields.map(([key, label, getValue]) => (
                <div className="record-field-row" key={key}>
                  <span className="record-field-icon">{label.charAt(0)}</span>
                  <div>
                    <span>{label}</span>
                    <strong>{getValue(record)}</strong>
                  </div>
                  <span className="field-confidence-badge field-confidence-high">Read-only</span>
                </div>
              ))}
            </div>
          </article>
        </>
      )}
    </main>
  );
}

function BlockedAccessMessage({ message }) {
  return (
    <section className="history-empty-state mechanic-blocked-state">
      <h2>Access unavailable</h2>
      <p>{message}</p>
      <Link className="button-link-secondary" to="/login">
        Back to owner sign in
      </Link>
    </section>
  );
}
