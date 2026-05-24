import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Car, Clock3, Copy, ExternalLink, QrCode, Shield } from 'lucide-react';
import {
  createQRAccessRequest,
  getOwnerMechanicAccessSessions,
  getVehicleQRAccessRequests,
  revokeOwnerMechanicAccessSession,
} from '../api/qrAccess';
import { getVehicle, getVehicles } from '../api/vehicles';

function vehicleName(vehicle) {
  if (!vehicle) return 'Selected vehicle';
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

function vehicleSubtitle(vehicle) {
  if (!vehicle) return '';
  return `${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}${
    vehicle.plateNumber ? ` - ${vehicle.plateNumber}` : ''
  }`;
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString();
}

function statusClass(status) {
  return `access-status access-status-${String(status || '').toLowerCase()}`;
}

function minutesRemaining(value) {
  if (!value) return 'Expiration unavailable';
  const minutes = Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 60000));
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours}h${remainder ? ` ${remainder}m` : ''} remaining`;
  }
  return `${minutes} min remaining`;
}

const LATEST_QR_TOKEN_KEY = 'trevora.mechanic.latestQrToken';

export default function QRSharingPage() {
  const { vehicleId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentRequest, setCurrentRequest] = useState(null);
  const [activeView, setActiveView] = useState('generate');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.localStorage.setItem('trevora.activeVehicleId', vehicleId);
  }, [vehicleId]);

  useEffect(() => {
    const view = new URLSearchParams(location.search).get('view');
    if (view === 'sessions') {
      setActiveView('sessions');
    } else if (view === 'generate') {
      setActiveView('generate');
    }
  }, [location.search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([
      getVehicle(vehicleId),
      getVehicleQRAccessRequests(vehicleId),
      getVehicles(),
      getOwnerMechanicAccessSessions('APPROVED'),
    ])
      .then(([vehicleData, requestData, vehicleList, sessionData]) => {
        if (!active) return;
        setVehicle(vehicleData);
        setVehicles(vehicleList);
        setRequests(requestData);
        setSessions(sessionData);
        setCurrentRequest(requestData[0] ?? null);
        window.localStorage.setItem('trevora.activeVehicleLabel', vehicleName(vehicleData));
        window.localStorage.setItem('trevora.activeVehicleSubtitle', vehicleSubtitle(vehicleData));
        if (requestData[0]?.accessToken) {
          window.localStorage.setItem(LATEST_QR_TOKEN_KEY, requestData[0].accessToken);
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

  function handleVehicleChange(event) {
    const nextVehicleId = event.target.value;
    const nextVehicle = vehicles.find((item) => item.vehicleId === nextVehicleId);

    window.localStorage.setItem('trevora.activeVehicleId', nextVehicleId);
    if (nextVehicle) {
      window.localStorage.setItem('trevora.activeVehicleLabel', vehicleName(nextVehicle));
      window.localStorage.setItem('trevora.activeVehicleSubtitle', vehicleSubtitle(nextVehicle));
    }
    navigate(`/vehicles/${nextVehicleId}/share`);
  }

  async function handleGenerate() {
    setSaving(true);
    setError('');
    setCopied(false);
    try {
      const created = await createQRAccessRequest(vehicleId);
      setCurrentRequest(created);
      setRequests((current) => [created, ...current]);
      window.localStorage.setItem(LATEST_QR_TOKEN_KEY, created.accessToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function revokeSession(sessionId) {
    setRevokingId(sessionId);
    setError('');
    try {
      await revokeOwnerMechanicAccessSession(sessionId);
      setSessions((current) => current.filter((session) => session.mechanicAccessSessionId !== sessionId));
    } catch (err) {
      setError(err.message);
    } finally {
      setRevokingId('');
    }
  }

  async function copyLink() {
    if (!currentRequest?.accessUrl) return;
    await navigator.clipboard.writeText(currentRequest.accessUrl);
    setCopied(true);
  }

  function rememberLatestRequestLink() {
    if (!currentRequest?.accessToken) return;
    window.localStorage.setItem(LATEST_QR_TOKEN_KEY, currentRequest.accessToken);
  }

  const activeSessions = sessions.filter((session) =>
    session.status === 'APPROVED' && session.vehicleProfileId === vehicleId
  );

  return (
    <main className="page-shell module-four-page">
      <section className="page-header shared-access-header">
        <div>
          <h1>Shared Access</h1>
          <p>Control who can view your vehicle service history</p>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {loading && <p className="muted">Loading share options...</p>}

      {!loading && (
        <>
        <section className="shared-access-notice">
          <span className="notice-icon">
            <Shield size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>Mechanic access requires your approval and is temporary read-only.</strong>
            <p>Mechanics can view but cannot edit, delete, or create service records.</p>
          </div>
        </section>

        <nav className="shared-access-tabs" aria-label="Shared access views">
          <button
            className={activeView === 'generate' ? 'shared-access-tab active' : 'shared-access-tab'}
            type="button"
            onClick={() => setActiveView('generate')}
          >
            Generate QR
          </button>
          <Link className="shared-access-tab" to="/access/requests">
            Requests ({requests.filter((request) => request.status === 'REQUESTED').length})
          </Link>
          <button
            className={activeView === 'sessions' ? 'shared-access-tab active' : 'shared-access-tab'}
            type="button"
            onClick={() => setActiveView('sessions')}
          >
            Active Sessions ({activeSessions.length})
          </button>
        </nav>

        {activeView === 'generate' ? (
          <section className="shared-access-layout">
          <article className="access-card">
            <div className="access-card-title-row">
              <div>
                <h2>Generate QR Access Code</h2>
                <p>Choose the vehicle history this temporary request can target.</p>
              </div>
              <span>
                <QrCode size={20} aria-hidden="true" />
              </span>
            </div>

            <label>
              Select Vehicle
              <select value={vehicleId} onChange={handleVehicleChange}>
                {vehicles.length === 0 ? (
                  <option value={vehicleId}>{vehicleName(vehicle)}</option>
                ) : (
                  vehicles.map((item) => (
                    <option key={item.vehicleId} value={item.vehicleId}>
                      {vehicleName(item)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <div className="access-scope-box">
              <span>
                <Car size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>Access scope</strong>
                <p>Service history for <strong>{vehicleName(vehicle)}</strong> only</p>
              </div>
            </div>

            <div className="access-warning-box">
              <AlertTriangle size={17} aria-hidden="true" />
              This QR creates an access request, not direct access. The mechanic must wait for your approval before
              viewing records.
            </div>

            <button className="generate-qr-button" type="button" onClick={handleGenerate} disabled={saving}>
              <QrCode size={18} aria-hidden="true" />
              {saving ? 'Generating...' : 'Generate One-time QR Code'}
            </button>

            <Link className="inline-link" to={`/vehicles/${vehicleId}/history`}>
              Back to service history
            </Link>
          </article>

          <article className="access-card qr-display-card">
            {currentRequest ? (
              <>
                <div className="qr-display-top">
                  <div className="qr-code-frame" aria-label="QR code for mechanic access request">
                    {currentRequest.accessUrl ? (
                      <QRCodeSVG
                        value={currentRequest.accessUrl}
                        size={208}
                        bgColor="#ffffff"
                        fgColor="#071526"
                        level="M"
                        includeMargin
                      />
                    ) : (
                      <div className="qr-missing-url">
                        <strong>QR unavailable</strong>
                        <p>The backend did not return a share URL for this access request.</p>
                      </div>
                    )}
                    <small>{currentRequest.accessToken}</small>
                  </div>
                  <div className="qr-display-summary">
                    <div className="qr-result-heading">
                      <strong>One-time access request ready</strong>
                      <span className={statusClass(currentRequest.status)}>{currentRequest.status}</span>
                    </div>
                    <p className="qr-scan-note">
                      Phone scanning requires the share URL to be reachable from the phone. Use deployment, a local
                      network IP, or a tunnel for real-device testing.
                    </p>
                  </div>
                </div>

                <div className="share-url-panel">
                  <label>
                    Share URL
                    <input value={currentRequest.accessUrl || ''} placeholder="Share URL unavailable" readOnly />
                  </label>
                  <div className="access-action-row">
                    <button className="button-secondary" type="button" onClick={copyLink}>
                      <Copy size={16} aria-hidden="true" />
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                    <Link
                      className="button-link"
                      to={`/access/request/${currentRequest.accessToken}`}
                      onClick={rememberLatestRequestLink}
                    >
                      <ExternalLink size={16} aria-hidden="true" />
                      Open request link
                    </Link>
                  </div>
                </div>
                <dl className="compact-facts">
                  <div>
                    <dt>Expires</dt>
                    <dd>{formatDateTime(currentRequest.expiresAt)}</dd>
                  </div>
                  <div>
                    <dt>Confirmed records in scope</dt>
                    <dd>{currentRequest.confirmedRecordCount}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="qr-empty-state">
                <span>
                  <QrCode size={40} aria-hidden="true" />
                </span>
                <strong>QR code will appear here</strong>
                <p>Select a vehicle and click Generate</p>
              </div>
            )}
          </article>

          <article className="access-card access-card-wide">
            <h2>Recent access requests</h2>
            {requests.length === 0 ? (
              <p className="muted">Generated access links for this vehicle will appear here.</p>
            ) : (
              <div className="access-request-list">
                {requests.map((request) => (
                  <div className="access-request-row" key={request.qrAccessRequestId}>
                    <div>
                      <strong>{request.accessToken}</strong>
                      <small>Expires {formatDateTime(request.expiresAt)}</small>
                    </div>
                    <span className={statusClass(request.status)}>{request.status}</span>
                  </div>
                ))}
              </div>
            )}
          </article>
          </section>
        ) : (
          <section className="access-card access-card-wide shared-session-panel">
            <div className="access-card-title-row">
              <div>
                <h2>Active Shared Sessions</h2>
                <p>Approved mechanics with temporary read-only access to {vehicleName(vehicle)}.</p>
              </div>
              <span>
                <Clock3 size={20} aria-hidden="true" />
              </span>
            </div>

            {activeSessions.length === 0 ? (
              <section className="history-empty-state compact-empty-state">
                <h2>No active shared sessions</h2>
                <p>Approved mechanic sessions for this vehicle will appear here until they expire or are revoked.</p>
                <button className="button-secondary" type="button" onClick={() => setActiveView('generate')}>
                  Generate a QR request
                </button>
              </section>
            ) : (
              <div className="active-session-list">
                {activeSessions.map((session) => (
                  <article className="active-session-card shared-access-session-card" key={session.mechanicAccessSessionId}>
                    <span className="session-clock">
                      <Clock3 size={16} aria-hidden="true" />
                    </span>
                    <div className="shared-session-main">
                      <strong>
                        {session.mechanicName || 'Mechanic'}
                        {session.shopName ? ` - ${session.shopName}` : ''}
                      </strong>
                      <small>{session.contactInfo || 'No contact provided'}</small>
                      <small>{session.vehicleLabel} · {session.permission} · {minutesRemaining(session.expiresAt)}</small>
                    </div>
                    <span className={statusClass(session.status)}>{session.status}</span>
                    <div className="access-action-row shared-session-actions">
                      <Link className="button-link-secondary" to={`/mechanic/access/${session.mechanicAccessSessionId}`}>
                        <ExternalLink size={15} aria-hidden="true" />
                        View
                      </Link>
                      <button
                        className="button-secondary danger"
                        type="button"
                        disabled={revokingId === session.mechanicAccessSessionId}
                        onClick={() => revokeSession(session.mechanicAccessSessionId)}
                      >
                        {revokingId === session.mechanicAccessSessionId ? 'Revoking...' : 'Revoke'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        </>
      )}
    </main>
  );
}
