import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StoredReceiptPreview from '../components/StoredReceiptPreview';
import { getMechanicSessionRecord } from '../api/mechanicAccess';
import { formatServiceText } from '../utils/serviceText';

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
  ['serviceType', 'Service Type', (record) => record.serviceType || 'Not provided'],
  ['category', 'Category', (record) => record.category],
  ['partsReplaced', 'Parts Replaced', (record) => formatServiceText(record.partsReplaced)],
  ['laborPerformed', 'Work Performed', (record) => formatServiceText(record.laborPerformed)],
  ['shopName', 'Shop / Mechanic', (record) => record.shopName || 'Not provided'],
  ['location', 'Location', (record) => record.location || 'Not provided'],
  ['totalCost', 'Total Cost', (record) => formatMoney(record.totalCost)],
  ['remarks', 'Remarks', (record) => record.remarks || 'Not provided'],
];

function hasStoredReceipt(record) {
  return Boolean(
    record?.receiptStoragePath
      || record?.fieldMetadata?.storedReceiptPages?.some((page) => page?.path),
  );
}

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
        <Link className="button-link-secondary mechanic-back-button" to={`/mechanic/access/${sessionId}`}>
          Back to shared records
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
              <h1>{record.serviceType || 'Service record'}</h1>
              <p>
                {formatDate(record.serviceDate)} - {detail.vehicleLabel}
              </p>
              <div className="record-detail-badges">
                <span className="badge">Verified</span>
                <span className="badge subtle">{record.sourceInputMethod}</span>
              </div>
            </div>
          </section>

          <section className="record-detail-layout mechanic-detail-layout">
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

            <aside className="record-detail-side mechanic-detail-side">
              {hasStoredReceipt(record) ? (
                <section className="record-source-card">
                  <StoredReceiptPreview source={record} title="Stored receipt" />
                </section>
              ) : (
                <section className="record-source-card">
                  <h2>Receipt</h2>
                  <p>No receipt image is attached to this shared record.</p>
                </section>
              )}

              <section className="record-source-card">
                <h2>Source Reference</h2>
                <dl className="compact-facts">
                  <div>
                    <dt>Source</dt>
                    <dd>{record.sourceInputMethod || 'Service record'}</dd>
                  </div>
                  <div>
                    <dt>Permission</dt>
                    <dd>{detail.permission}</dd>
                  </div>
                  <div>
                    <dt>Record ID</dt>
                    <dd>{record.recordId}</dd>
                  </div>
                  <div>
                    <dt>Access expires</dt>
                    <dd>{detail.expiresAt ? new Date(detail.expiresAt).toLocaleString() : 'Not provided'}</dd>
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

function BlockedAccessMessage({ message }) {
  return (
    <section className="history-empty-state mechanic-blocked-state">
      <h2>Access unavailable</h2>
      <p>{message}</p>
      <Link className="button-link-secondary" to="/">
        Back
      </Link>
    </section>
  );
}
