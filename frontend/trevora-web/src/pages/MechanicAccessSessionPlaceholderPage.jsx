import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMechanicSessionHistory } from '../api/mechanicAccess';
import MechanicAISearchPanel from '../components/MechanicAISearchPanel';

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

function minutesRemaining(expiresAt) {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000));
}

export default function MechanicAccessSessionPlaceholderPage() {
  const { sessionId } = useParams();
  const [history, setHistory] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const records = useMemo(() => history?.records ?? [], [history]);
  const matchedIds = useMemo(
    () => new Set((searchResult?.records ?? []).map((record) => record.recordId)),
    [searchResult]
  );
  const visibleRecords = searchResult ? searchResult.records : records;
  const remaining = minutesRemaining(history?.expiresAt);

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
    <main className="page-shell mechanic-shared-page">
      {error && !loading ? (
        <section className="history-empty-state mechanic-blocked-state">
          <h2>Access unavailable</h2>
          <p>{error}</p>
          <Link className="button-link-secondary" to="/login">
            Back to owner sign in
          </Link>
        </section>
      ) : (
        <>
          {loading && <p className="muted">Loading approved service history...</p>}

          {history && (
            <>
              <div className="readonly-access-banner">
                <span className="notice-icon">R</span>
                <div>
                  <strong>Temporary read-only access granted for {history.vehicleLabel}</strong>
                  <p>
                    Scope: confirmed service history only - {records.length} record{records.length === 1 ? '' : 's'} -
                    {remaining == null ? ' active session' : ` ${remaining} min remaining`}
                  </p>
                </div>
                <span className="access-status access-status-active">Access active</span>
              </div>

              <MechanicAISearchPanel sessionId={sessionId} onSearch={setSearchResult} />

              <section className="mechanic-record-section">
                <div className="mechanic-record-header">
                  <h2>Service History</h2>
                  <span>
                    {visibleRecords.length} of {records.length} approved record{records.length === 1 ? '' : 's'}
                    {searchResult ? ' matched' : ' shown'}
                  </span>
                </div>

                {records.length === 0 ? (
                  <div className="history-empty-state">
                    <h2>No confirmed service records in scope</h2>
                    <p>The owner approved access, but this vehicle has no confirmed service records yet.</p>
                  </div>
                ) : visibleRecords.length === 0 ? (
                  <div className="history-empty-state">
                    <h2>No matching shared records</h2>
                    <p>Try a different service type, shop, part, or work keyword.</p>
                  </div>
                ) : (
                  <div className="mechanic-record-list">
                    {visibleRecords.map((record) => (
                      <article
                        className={`mechanic-record-card ${matchedIds.has(record.recordId) ? 'mechanic-record-card-match' : ''}`}
                        key={record.recordId}
                      >
                        <div>
                          <div className="mechanic-record-title">
                            <strong>{record.serviceType}</strong>
                            <span className={badgeClass('Validated')}>Verified</span>
                            <span className={badgeClass(record.sourceInputMethod)}>{record.sourceInputMethod}</span>
                            {matchedIds.has(record.recordId) && <span className={badgeClass('ai-match')}>AI match</span>}
                          </div>
                          <p>
                            {formatDate(record.serviceDate)} - {record.shopName || 'Shop not provided'} -{' '}
                            {record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'} -{' '}
                            {formatMoney(record.totalCost)}
                          </p>
                          {String(record.sourceInputMethod || '').toLowerCase() === 'voice' && (
                            <small className="voice-caution">Captured via voice, some fields may have lower confidence</small>
                          )}
                        </div>
                        <Link className="button-link-secondary" to={`/mechanic/access/${sessionId}/history/${record.recordId}`}>
                          View Details
                        </Link>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <Link className="owner-return-link owner-return-link-inline" to="/login">
                Back to owner sign in
              </Link>
            </>
          )}
        </>
      )}
    </main>
  );
}
