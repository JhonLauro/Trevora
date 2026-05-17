import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { setCurrentDemoUser } from '../api/currentUser';
import {
  getPublicQRAccessRequest,
  getMechanicRequestStatus,
  submitMechanicAccessRequest,
} from '../api/qrAccess';

function formatDateTime(value) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString();
}

const DEMO_QR_TOKEN_KEY = 'trevora.demoMechanic.latestQrToken';
const DEMO_SESSION_ID_KEY = 'trevora.demoMechanic.approvedSessionId';
const DEMO_MECHANIC_ID = '00000000-0000-0000-0000-000000000002';

export default function MechanicAccessRequestPage() {
  const { token } = useParams();
  const [shareRequest, setShareRequest] = useState(null);
  const [form, setForm] = useState({
    mechanicName: 'Juan Santos',
    shopName: 'Superior Auto Repairs',
    contactInfo: '+63 917 123 4567',
    reason: 'Checking this vehicle service history before maintenance.',
  });
  const [submittedRequest, setSubmittedRequest] = useState(null);
  const [approvedSession, setApprovedSession] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    window.localStorage.setItem(DEMO_QR_TOKEN_KEY, token);
    setCurrentDemoUser(DEMO_MECHANIC_ID);

    loadPublicMechanicStatus(token)
      .then((status) => {
        if (!active) return;
        setShareRequest(status.qrRequest);
        if (status.mechanicRequest) {
          setSubmittedRequest(status.mechanicRequest);
          setShowRequestModal(false);
        }
        if (status.session) {
          setApprovedSession(status.session);
          window.localStorage.setItem(DEMO_SESSION_ID_KEY, status.session.mechanicAccessSessionId);
          setShowRequestModal(false);
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
  }, [token]);

  useEffect(() => {
    if (!submittedRequest || approvedSession) return undefined;

    const intervalId = window.setInterval(() => {
      getMechanicRequestStatus(token)
        .then((status) => {
          if (status.mechanicRequest) setSubmittedRequest(status.mechanicRequest);
          if (status.session) {
            setApprovedSession(status.session);
            window.localStorage.setItem(DEMO_SESSION_ID_KEY, status.session.mechanicAccessSessionId);
          }
        })
        .catch(() => {});
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [approvedSession, submittedRequest, token]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function loadPublicMechanicStatus(currentToken) {
    try {
      return await getMechanicRequestStatus(currentToken);
    } catch (err) {
      const qrRequest = await getPublicQRAccessRequest(currentToken);
      return {
        qrRequest,
        mechanicRequest: null,
        session: null,
      };
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const request = await submitMechanicAccessRequest(token, form);
      setSubmittedRequest(request);
      setShowRequestModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell module-four-page">
      <section className="mechanic-landing-hero">
        <p className="eyebrow">Mechanic Access</p>
        <h1>{shareRequest ? shareRequest.vehicleLabel : 'Vehicle service history'}</h1>
        <p>
          This QR link lets you request temporary read-only access. The owner must approve before records are shown.
        </p>
      </section>

      {loading && <p className="muted">Checking access link...</p>}
      {error && <div className="alert">{error}</div>}

      {!loading && shareRequest && (
        <>
        <section className="mechanic-dashboard-grid">
          <article className="mechanic-dashboard-card primary">
            <span className="badge subtle">Shared vehicle</span>
            <h2>{shareRequest.vehicleLabel}</h2>
            <p>{shareRequest.plateNumber || 'Plate number not provided'}</p>
            <dl className="compact-facts">
              <div>
                <dt>Status</dt>
                <dd>{shareRequest.status}</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{formatDateTime(shareRequest.expiresAt)}</dd>
              </div>
              <div>
                <dt>Confirmed records in scope</dt>
                <dd>{shareRequest.confirmedRecordCount}</dd>
              </div>
            </dl>
            <div className="access-scope-box">
              <strong>Read-only after approval</strong>
              <p>The owner must approve this request before any service history can be viewed.</p>
            </div>
          </article>

          <article className="mechanic-dashboard-card">
            <h2>Access status</h2>
            {!submittedRequest && (
              <>
                <p>No request has been sent yet.</p>
                <button type="button" onClick={() => setShowRequestModal(true)}>
                  Request owner approval
                </button>
              </>
            )}
            {submittedRequest && !approvedSession && (
              <>
                <span className="access-status access-status-pending">{submittedRequest.status}</span>
                <p>Your request was sent to the owner. This page will update after approval.</p>
                <button className="button-secondary" type="button" onClick={() => window.location.reload()}>
                  Refresh status
                </button>
              </>
            )}
            {approvedSession && (
              <>
                <span className="access-status access-status-approved">APPROVED</span>
                <p>Temporary read-only access is ready.</p>
                <Link className="button-link" to={`/mechanic/access/${approvedSession.mechanicAccessSessionId}`}>
                  View service history
                </Link>
              </>
            )}
          </article>
        </section>

        {showRequestModal && !submittedRequest && (
          <div className="modal-backdrop">
            <section className="mechanic-request-modal" role="dialog" aria-modal="true" aria-labelledby="request-title">
              <div className="access-card-header">
                <div>
                  <p className="eyebrow">Mechanic Request</p>
                  <h2 id="request-title">Send request to owner</h2>
                  <p>Fill in your details so the owner knows who is asking for access.</p>
                </div>
                <button className="icon-close-button" type="button" onClick={() => setShowRequestModal(false)}>
                  ×
                </button>
              </div>
              <form className="auth-form" onSubmit={handleSubmit}>
                <label>
                  Mechanic name
                  <input name="mechanicName" value={form.mechanicName} onChange={updateField} required autoFocus />
                </label>
                <label>
                  Shop name
                  <input name="shopName" value={form.shopName} onChange={updateField} />
                </label>
                <label>
                  Contact info
                  <input name="contactInfo" value={form.contactInfo} onChange={updateField} />
                </label>
                <label>
                  Reason for access
                  <textarea name="reason" value={form.reason} onChange={updateField} rows="4" />
                </label>
                <button type="submit" disabled={saving}>
                  {saving ? 'Sending request...' : 'Send request'}
                </button>
              </form>
            </section>
          </div>
        )}
        </>
      )}
    </main>
  );
}
