import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  approveMechanicAccessRequest,
  denyMechanicAccessRequest,
  getMechanicAccessRequests,
} from '../api/qrAccess';

function formatDateTime(value) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString();
}

function statusClass(status) {
  return `access-status access-status-${String(status || '').toLowerCase()}`;
}

export default function OwnerAccessRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('PENDING');
  const [decision, setDecision] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const activeVehicleId = window.localStorage.getItem('trevora.activeVehicleId') || requests[0]?.vehicleProfileId || '';
  const generateQrPath = activeVehicleId ? `/vehicles/${activeVehicleId}/share` : '/vehicles';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getMechanicAccessRequests(filter)
      .then((data) => {
        if (active) setRequests(data);
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
  }, [filter]);

  async function decide(requestId, action) {
    setSavingId(requestId);
    setError('');
    try {
      const response = action === 'approve'
        ? await approveMechanicAccessRequest(requestId)
        : await denyMechanicAccessRequest(requestId);
      setDecision(response);
      setRequests((current) =>
        current.map((request) =>
          request.mechanicAccessRequestId === requestId ? response.request : request
        )
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId('');
    }
  }

  return (
    <main className="page-shell module-four-page">
      <section className="page-header shared-access-header">
        <div>
          <h1>Shared Access</h1>
          <p>Control who can view your vehicle service history</p>
        </div>
      </section>

      <section className="shared-access-notice">
        <span className="notice-icon">▢</span>
        <div>
          <strong>Mechanic access requires your approval and is temporary read-only.</strong>
          <p>Mechanics can view but cannot edit, delete, or create service records.</p>
        </div>
      </section>

      <nav className="shared-access-tabs" aria-label="Shared access views">
        <Link className="shared-access-tab" to={generateQrPath}>
          Generate QR
        </Link>
        <span className="shared-access-tab active">Requests ({requests.length})</span>
        <span className="shared-access-tab disabled">Active Sessions</span>
      </nav>

      {error && <div className="alert">{error}</div>}
      {decision?.session && (
        <div className="success-banner">
          Approved. Temporary read-only session expires {formatDateTime(decision.session.expiresAt)}.
          <Link to={`/mechanic/access/${decision.session.mechanicAccessSessionId}`}> View Person D placeholder</Link>
        </div>
      )}
      {decision && !decision.session && <div className="success-banner">Request denied. Mechanic access is blocked.</div>}

      <section className="history-filter-bar access-filter-bar">
        <label>
          Status
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="DENIED">Denied</option>
            <option value="">All</option>
          </select>
        </label>
      </section>

      {loading ? (
        <p className="muted">Loading mechanic requests...</p>
      ) : requests.length === 0 ? (
        <section className="history-empty-state">
          <h2>No requests found</h2>
          <p>Mechanic requests submitted from QR/share links will appear here.</p>
        </section>
      ) : (
        <section className="mechanic-request-list">
          {requests.map((request) => (
            <article className="mechanic-request-card" key={request.mechanicAccessRequestId}>
              <div className="access-card-header">
                <div>
                  <h2>{request.mechanicName}</h2>
                  <p>{request.shopName || 'Shop not provided'}</p>
                  <small>{request.contactInfo || 'Contact not provided'}</small>
                </div>
                <small>{formatDateTime(request.requestedAt)}</small>
                <span className={statusClass(request.status)}>{request.status}</span>
              </div>

              <dl className="compact-facts mechanic-request-facts">
                <div>
                  <dt>Requested vehicle</dt>
                  <dd>{request.vehicleLabel}</dd>
                </div>
                <div>
                  <dt>Permission</dt>
                  <dd>Temporary read-only</dd>
                </div>
                <div>
                  <dt>Access scope</dt>
                  <dd>Selected vehicle history only</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{request.reason || 'No reason provided'}</dd>
                </div>
              </dl>

              {request.status === 'PENDING' && (
                <div className="access-action-row">
                  <button
                    type="button"
                    disabled={savingId === request.mechanicAccessRequestId}
                    onClick={() => decide(request.mechanicAccessRequestId, 'approve')}
                  >
                    Approve read-only access
                  </button>
                  <button
                    className="button-secondary danger"
                    type="button"
                    disabled={savingId === request.mechanicAccessRequestId}
                    onClick={() => decide(request.mechanicAccessRequestId, 'deny')}
                  >
                    Deny
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
