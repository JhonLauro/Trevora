import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMechanicSessionHistory } from '../api/qrAccess';

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

function badgeClass(value) {
  return `dashboard-badge dashboard-badge-${String(value || 'draft').toLowerCase().replace(/\s+/g, '-')}`;
}

export default function MechanicAccessSessionPlaceholderPage() {
  const { sessionId } = useParams();
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const records = useMemo(() => history?.records ?? [], [history]);
  const visibleRecords = records.slice(0, 5);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getMechanicSessionHistory(sessionId)
      .then((data) => {
        if (active) setHistory(data);
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
  }, [sessionId]);

  return (
    <main className="page-shell mechanic-readonly-page">
      <section className="mechanic-public-topbar">
        <div className="mechanic-public-brand">
          <span className="brand-icon">⌁</span>
          <strong>Trevora</strong>
          <span className="topbar-divider" />
          <span>Selected vehicle</span>
          <span className="access-status access-status-approved">Read-only access</span>
        </div>
        <span className="session-timer">◷ 1h 47m remaining</span>
      </section>

      <section className="mechanic-readonly-container">
        <div className="readonly-access-banner">
          <span className="notice-icon">▢</span>
          <div>
            <strong>Temporary read-only access granted by vehicle owner</strong>
            <p>Scope: Full service history · {records.length} record{records.length === 1 ? '' : 's'} · Demo session</p>
          </div>
          <span className="access-status access-status-active">Access active</span>
        </div>

        <section className="mechanic-ask-card">
          <div className="mechanic-ask-heading">
            <span>✧</span>
            <div>
              <strong>Ask about this vehicle's history</strong>
              <p>AI mechanic search is reserved for the next handoff step in this MVP demo.</p>
            </div>
          </div>
          <div className="mechanic-ask-input">
            <input placeholder="e.g. When was the last oil change?" disabled />
            <button type="button" disabled>
              Ask
            </button>
          </div>
          <div className="mechanic-suggestion-row">
            <span>Try:</span>
            <button type="button">When was the last oil change?</button>
            <button type="button">Any brake work done?</button>
            <button type="button">Are there warnings?</button>
          </div>
        </section>

        {loading && <p className="muted">Loading approved service history...</p>}
        {error && <div className="alert">{error}</div>}

        {!loading && !error && (
          <section className="mechanic-record-section">
            <div className="mechanic-record-header">
              <h2>Service History</h2>
              <span>
                {visibleRecords.length} of {records.length} record{records.length === 1 ? '' : 's'} shown
              </span>
            </div>

            {records.length === 0 ? (
              <div className="history-empty-state">
                <h2>No confirmed service records in scope</h2>
                <p>The owner approved access, but this vehicle has no confirmed service records yet.</p>
              </div>
            ) : (
              <div className="mechanic-record-list">
                {visibleRecords.map((record) => (
                  <article className="mechanic-record-card" key={record.recordId}>
                    <div>
                      <div className="mechanic-record-title">
                        <strong>{record.serviceType}</strong>
                        <span className={badgeClass('Validated')}>Verified</span>
                        <span className={badgeClass(record.sourceInputMethod)}>{record.sourceInputMethod}</span>
                      </div>
                      <p>
                        {formatDate(record.serviceDate)} · {record.shopName || 'Shop not provided'} ·{' '}
                        {record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'} ·{' '}
                        {formatMoney(record.totalCost)}
                      </p>
                      {String(record.sourceInputMethod || '').toLowerCase() === 'voice' && (
                        <small className="voice-caution">△ Captured via voice, some fields may have lower confidence</small>
                      )}
                    </div>
                    <button className="button-link-secondary" type="button">
                      View Details ›
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <Link className="inline-link" to="/mechanic">
          Back to mechanic access status
        </Link>
      </section>
    </main>
  );
}
