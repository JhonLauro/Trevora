import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import {
  getPublicQRAccessRequest,
  getMechanicRequestStatus,
  submitMechanicAccessRequest,
} from '../api/qrAccess';
import InkLockup from '../components/InkLockup.jsx';

/**
 * What a mechanic sees after scanning an owner's code, before anything has
 * been approved.
 *
 * <p>This is the only screen in the product someone outside the account ever
 * reaches, and they reach it having been handed a phone by a customer. It was
 * the last page still on the pre-Ink classes in styles.css — `page-shell`,
 * `mechanic-dashboard-card`, `button-secondary`, `modal-backdrop` — so it
 * could not be re-skinned by the brand layer the way the other screens were.
 * Rebuilt here on its own sheet, styles/mechanic-request.css.
 *
 * <p>Three things changed besides the paint, and they are not cosmetic:
 *
 * <ul>
 *   <li><b>The form no longer arrives pre-filled with someone else's name.</b>
 *   It shipped defaulted to "Juan Santos" of "Superior Auto Repairs" with a
 *   phone number and a canned reason — demo data left in a live form. A
 *   mechanic who tapped Send without editing four fields sent the owner a
 *   request from a person who does not exist, and the owner's approval screen
 *   would have shown them that name. Fields start empty.</li>
 *   <li><b>The request form is inline, not a modal that opens by itself.</b>
 *   It opened over the page before the reader had seen what they were being
 *   asked to agree to, and a backdrop dialog on a phone held at arm's length
 *   in a workshop is the wrong container for four text fields.</li>
 *   <li><b>The status enum is not printed raw.</b> "PENDING" was rendered
 *   straight from the API into a sentence a stranger reads.</li>
 * </ul>
 *
 * <p>What deliberately did not change: no plate number appears here. The page
 * is reachable by anyone holding the link, before the owner has approved
 * anything, so it shows only the label the owner chose. The plate arrives with
 * the approved history.
 */

const LATEST_QR_TOKEN_KEY = 'trevora.mechanic.latestQrToken';
const APPROVED_SESSION_ID_KEY = 'trevora.mechanic.approvedSessionId';

/* The API answers with the enum. Nobody outside the codebase should read it. */
const STATUS_WORDS = {
  PENDING: 'Waiting for the owner',
  APPROVED: 'Approved',
  DENIED: 'Declined',
  EXPIRED: 'Expired',
  REVOKED: 'Ended by the owner',
};

function statusWord(value) {
  if (!value) return 'Unknown';
  return STATUS_WORDS[String(value).toUpperCase()] ?? String(value).toLowerCase();
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const EMPTY_FORM = {
  mechanicName: '',
  shopName: '',
  contactInfo: '',
  reason: '',
};

export default function MechanicAccessRequestPage() {
  const { token } = useParams();
  const nameRef = useRef(null);
  const [shareRequest, setShareRequest] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submittedRequest, setSubmittedRequest] = useState(null);
  const [approvedSession, setApprovedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    window.localStorage.setItem(LATEST_QR_TOKEN_KEY, token);

    loadPublicMechanicStatus(token)
      .then((status) => {
        if (!active) return;
        setShareRequest(status.qrRequest);
        if (status.mechanicRequest) setSubmittedRequest(status.mechanicRequest);
        if (status.session) {
          setApprovedSession(status.session);
          window.localStorage.setItem(APPROVED_SESSION_ID_KEY, status.session.mechanicAccessSessionId);
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
            window.localStorage.setItem(APPROVED_SESSION_ID_KEY, status.session.mechanicAccessSessionId);
          }
        })
        .catch(() => {});
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [approvedSession, submittedRequest, token]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
    if (name === 'mechanicName' && nameError) setNameError('');
  }

  async function loadPublicMechanicStatus(currentToken) {
    try {
      return await getMechanicRequestStatus(currentToken);
    } catch (err) {
      const qrRequest = await getPublicQRAccessRequest(currentToken);
      return { qrRequest, mechanicRequest: null, session: null };
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // The owner approves or declines on the strength of this name. It is the
    // one field that has to be there.
    if (!form.mechanicName.trim()) {
      setNameError('Enter your name so the owner knows who is asking.');
      nameRef.current?.focus();
      return;
    }

    setSaving(true);
    setError('');

    try {
      const request = await submitMechanicAccessRequest(token, {
        mechanicName: form.mechanicName.trim(),
        shopName: form.shopName.trim(),
        contactInfo: form.contactInfo.trim(),
        reason: form.reason.trim(),
      });
      setSubmittedRequest(request);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mreq tv-reveal-group">
      <header className="mreq__bar">
        <InkLockup />
        <Link className="mreq__owner-link" to="/login">
          Owner? Sign in
        </Link>
      </header>

      <main className="mreq__body">
        <div className="mreq__intro">
          <p className="mreq__eyebrow">Mechanic access</p>
          <h1 className="mreq__title">
            {shareRequest ? shareRequest.vehicleLabel : 'Vehicle service history'}
          </h1>
          <p className="mreq__lead">
            Scanning does not open anything. You ask, the owner approves, and only then can you
            read this vehicle&apos;s confirmed records — read-only, and it expires by itself.
          </p>
        </div>

        {loading && <p className="mreq__note">Checking this link…</p>}
        {error && <p className="mreq__alert" role="alert">{error}</p>}

        {!loading && shareRequest && (
          <>
            <section className="mreq__card">
              <h2 className="mreq__card-title">What you are asking to see</h2>
              <dl className="mreq__facts">
                <div>
                  <dt>Vehicle</dt>
                  <dd>{shareRequest.vehicleLabel}</dd>
                </div>
                <div>
                  <dt>Confirmed records in scope</dt>
                  <dd>{shareRequest.confirmedRecordCount}</dd>
                </div>
                <div>
                  <dt>This link expires</dt>
                  <dd>{formatDateTime(shareRequest.expiresAt)}</dd>
                </div>
              </dl>
              <p className="mreq__scope">
                <span className="mreq__scope-icon" aria-hidden="true">
                  <ShieldCheck size={18} />
                </span>
                <span>
                  <strong>Read-only, one vehicle, and time-limited.</strong> You cannot add, edit
                  or delete anything, and the owner can end your access at any point.
                </span>
              </p>
            </section>

            {approvedSession && (
              <section className="mreq__card mreq__card--go">
                <p className="mreq__status mreq__status--ok">Approved</p>
                <p className="mreq__note">The history is ready to read.</p>
                <Link
                  className="mreq__button"
                  to={`/mechanic/access/${approvedSession.mechanicAccessSessionId}`}
                >
                  View service history
                </Link>
              </section>
            )}

            {!approvedSession && submittedRequest && (
              <section className="mreq__card">
                <p className="mreq__status mreq__status--pending">
                  {statusWord(submittedRequest.status)}
                </p>
                <p className="mreq__note">
                  Your request has been sent. Leave this page open — it checks every few seconds
                  and will change on its own once the owner answers.
                </p>
              </section>
            )}

            {!approvedSession && !submittedRequest && (
              <section className="mreq__card">
                <h2 className="mreq__card-title">Ask the owner</h2>
                <p className="mreq__note">
                  They see these details when they decide, so put in what you would tell them
                  standing at the counter.
                </p>

                <form className="mreq__form" onSubmit={handleSubmit} noValidate>
                  <label className="mreq__field" data-invalid={nameError ? 'true' : 'false'}>
                    <span className="mreq__label">Your name</span>
                    <input
                      ref={nameRef}
                      name="mechanicName"
                      value={form.mechanicName}
                      onChange={updateField}
                      autoComplete="name"
                      placeholder="Who the owner is approving"
                    />
                    {nameError && <span className="mreq__error">{nameError}</span>}
                  </label>

                  <label className="mreq__field">
                    <span className="mreq__label">
                      Shop <span className="mreq__optional">optional</span>
                    </span>
                    <input
                      name="shopName"
                      value={form.shopName}
                      onChange={updateField}
                      autoComplete="organization"
                      placeholder="Where you are working on it"
                    />
                  </label>

                  <label className="mreq__field">
                    <span className="mreq__label">
                      Contact <span className="mreq__optional">optional</span>
                    </span>
                    <input
                      name="contactInfo"
                      value={form.contactInfo}
                      onChange={updateField}
                      autoComplete="tel"
                      placeholder="A number they can reach you on"
                    />
                  </label>

                  <label className="mreq__field">
                    <span className="mreq__label">
                      Why you need it <span className="mreq__optional">optional</span>
                    </span>
                    <textarea
                      name="reason"
                      rows="3"
                      value={form.reason}
                      onChange={updateField}
                      placeholder="Checking what was last done before I start"
                    />
                  </label>

                  <button className="mreq__button" type="submit" disabled={saving}>
                    {saving ? 'Sending…' : 'Send request'}
                  </button>
                </form>
              </section>
            )}
          </>
        )}

        <p className="mreq__footer">
          Trevora keeps a vehicle&apos;s service history for its owner. Nothing on this page is
          visible to you until they say so.
        </p>
      </main>
    </div>
  );
}
