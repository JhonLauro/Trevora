import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StoredReceiptPreview from '../components/StoredReceiptPreview';
import ServiceItemsList from '../components/ServiceItemsList';
import { getMechanicSessionRecord } from '../api/mechanicAccess';
import { serviceItemsSummaryLabel } from '../utils/serviceText';

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

function hasStoredReceipt(record) {
  return Boolean(
    record?.receiptStoragePath
      || record?.fieldMetadata?.storedReceiptPages?.some((page) => page?.path),
  );
}

function sourceLabel(value) {
  if (!value) return 'Manual';
  return String(value).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classificationFor(record) {
  const metadataClassification = record?.fieldMetadata?.classification;
  if (metadataClassification && typeof metadataClassification === 'object') return metadataClassification;
  if (record?.classification && typeof record.classification === 'object') return record.classification;
  return {};
}

function relatedComponentsFor(record, classification) {
  if (Array.isArray(record?.relatedComponents) && record.relatedComponents.length) return record.relatedComponents;
  if (Array.isArray(classification?.relatedComponents) && classification.relatedComponents.length) return classification.relatedComponents;
  return [];
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
  const classification = record ? classificationFor(record) : {};
  const relatedComponents = relatedComponentsFor(record, classification);
  const category = record?.category || classification.serviceCategory || 'Service';
  const source = sourceLabel(record?.sourceInputMethod);

  return (
    <main className="page-shell mechanic-shared-page tv-reveal-group">
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
              <h1>{serviceItemsSummaryLabel(record.services)}</h1>
              <p>
                {formatDate(record.serviceDate)} - {detail.vehicleLabel}
              </p>
              <div className="record-detail-badges">
                <span className="badge">Verified</span>
                <span className="badge subtle">{source}</span>
                <span className="badge subtle">{category}</span>
                {classification.source && <span className="badge subtle">{classification.source} classified</span>}
              </div>
            </div>
          </section>

          <section className="record-detail-layout mechanic-detail-layout">
            <article className="record-detail-card mechanic-detail-card">
              <div className="record-detail-card-header">
                <h2>Service snapshot</h2>
                <span>Read-only</span>
              </div>

              <div className="mechanic-detail-summary-grid">
                <div>
                  <span>Date</span>
                  <strong>{formatDate(record.serviceDate)}</strong>
                </div>
                <div>
                  <span>Odometer</span>
                  <strong>{record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'Not provided'}</strong>
                </div>
                <div>
                  <span>Total cost</span>
                  <strong>{formatMoney(record.totalCost)}</strong>
                </div>
                <div>
                  <span>Shop</span>
                  <strong>{record.shopName || 'Not provided'}</strong>
                </div>
              </div>

              <div className="mechanic-component-chips mechanic-detail-components">
                <span>{category}</span>
                {relatedComponents.map((component) => (
                  <span key={component}>{component}</span>
                ))}
                {relatedComponents.length === 0 && <span>No component label yet</span>}
              </div>

              <div className="mechanic-detail-focus-grid mechanic-detail-services">
                <span>Services</span>
                <ServiceItemsList services={record.services} />
              </div>

              <section className="mechanic-work-card mechanic-work-card-wide">
                <span>Customer / technician notes</span>
                <strong>{record.remarks || 'No notes provided'}</strong>
              </section>

              <div className="mechanic-source-note">
                <strong>Vehicle</strong>
                <span>{detail.vehicleLabel}</span>
                {record.location && <span>{record.location}</span>}
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
                    <dd>{source || 'Service record'}</dd>
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
