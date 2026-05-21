import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Car, Copy, ExternalLink, QrCode, Shield } from 'lucide-react';
import { createQRAccessRequest, getVehicleQRAccessRequests } from '../api/qrAccess';
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

const LATEST_QR_TOKEN_KEY = 'trevora.mechanic.latestQrToken';

export default function QRSharingPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [currentRequest, setCurrentRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.localStorage.setItem('trevora.activeVehicleId', vehicleId);
  }, [vehicleId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([getVehicle(vehicleId), getVehicleQRAccessRequests(vehicleId), getVehicles()])
      .then(([vehicleData, requestData, vehicleList]) => {
        if (!active) return;
        setVehicle(vehicleData);
        setVehicles(vehicleList);
        setRequests(requestData);
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

  async function copyLink() {
    if (!currentRequest?.accessUrl) return;
    await navigator.clipboard.writeText(currentRequest.accessUrl);
    setCopied(true);
  }

  function rememberLatestRequestLink() {
    if (!currentRequest?.accessToken) return;
    window.localStorage.setItem(LATEST_QR_TOKEN_KEY, currentRequest.accessToken);
  }

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
          <span className="shared-access-tab active">Generate QR</span>
          <Link className="shared-access-tab" to="/access/requests">
            Requests ({requests.filter((request) => request.status === 'REQUESTED').length})
          </Link>
          <span className="shared-access-tab disabled">Active Sessions</span>
        </nav>

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
        </>
      )}
    </main>
  );
}
