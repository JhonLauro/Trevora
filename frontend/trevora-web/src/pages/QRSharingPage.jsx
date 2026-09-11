import React, { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { QRCodeSVG } from 'qrcode.react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Copy, ExternalLink, ShieldCheck } from 'lucide-react';
import Tabs from '../components/ink/Tabs.jsx';
import {
  createQRAccessRequest,
  getOwnerMechanicAccessSessions,
  getVehicleQRAccessRequests,
  revokeOwnerMechanicAccessSession,
} from '../api/qrAccess';
import { getVehicle, getVehicles } from '../api/vehicles';
import { displayVehicleName } from '../utils/vehicleText';
import { pluralize } from '../utils/format';
import useSharingPolicy from '../hooks/useSharingPolicy.js';

/**
 * Make a share link for one vehicle, and manage who currently holds one.
 *
 * Migrated off the pre-Ink classes. Four things fixed beyond the styling:
 *
 * - **The scope box orphaned a word.** "Service history for {vehicle} only"
 *   was one sentence wrapped across a narrow card, so "only" landed alone on
 *   its own line — the one word in it that changes the meaning. It is now a
 *   labelled fact, not a sentence that has to survive wrapping.
 * - **The status badge shouted a raw enum.** A fresh link is ACTIVE and a
 *   used one is APPROVED; both were printed verbatim in caps. They now read
 *   as what they mean to the owner.
 * - **Expiry was a raw locale string** with seconds in it.
 * - **Two of the three tabs were links that navigated away.** Requests lives
 *   on its own page, so it is a header link now, and the tabs are only the
 *   two views this page actually has.
 *
 * The `trevora.activeVehicleId` writes are gone: vehicle identity comes from
 * the route, and that key's only reader was a fallback on the requests page
 * that could send an owner to the Garage instead of here.
 */

const STATUS = {
  ACTIVE: { tone: 'ok', labelKey: 'share.readyToScan' },
  REQUESTED: { tone: 'warn', labelKey: 'share.mechanicAsked' },
  APPROVED: { tone: 'ok', labelKey: 'requests.approved' },
  DENIED: { tone: 'bad', labelKey: 'requests.denied' },
  EXPIRED: { tone: 'none', labelKey: 'share.expired' },
};

function statusOf(request) {
  /* The fallback returns a `text` rather than a key: an unrecognised status is
     whatever the server called it, and there is no translation for a string we
     have never seen. Callers prefer labelKey and fall back to text. */
  return STATUS[String(request?.status || '').toUpperCase()]
    ?? { tone: 'none', text: request?.status ?? 'Unknown' };
}

/** "26 Aug, 2:46 PM" — no seconds; nobody schedules around a second. */
function shortDateTime(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function timeLeft(value) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${pluralize(hours, 'hour')} left`;
  return `${Math.max(1, Math.ceil(ms / 60000))} min left`;
}

export default function QRSharingPage() {
  const t = useT();
  const { linkDuration, sessionDuration, sessionHours } = useSharingPolicy();
  const { vehicleId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [current, setCurrent] = useState(null);
  const [view, setView] = useState('link');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('view');
    if (requested === 'sessions') setView('sessions');
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
        setVehicles(vehicleList ?? []);
        setRequests(requestData ?? []);
        setSessions(sessionData ?? []);
        setCurrent(requestData?.[0] ?? null);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [vehicleId]);

  async function handleGenerate() {
    setSaving(true);
    setError('');
    setCopied(false);
    try {
      const created = await createQRAccessRequest(vehicleId);
      setCurrent(created);
      /* Generating again usually overwrites the link nobody has scanned, so
         the server hands back a row this list already holds. Replace it by id
         rather than adding it twice. */
      setRequests((list) => [
        created,
        ...list.filter((request) => request.qrAccessRequestId !== created.qrAccessRequestId),
      ]);
      /* Then take the server's list as the truth. Nothing is flipped to expired
         here first: a local guess can show an owner an old code as dead while
         it still opens a request, which is the one thing this list must never
         get wrong. The refresh also brings the `createdAt` the create response
         has been arriving without ("Made Not recorded"). A failed refresh is
         not worth an error -- the link was made. */
      getVehicleQRAccessRequests(vehicleId)
        .then((fresh) => { if (Array.isArray(fresh)) setRequests(fresh); })
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function revoke(sessionId) {
    setRevokingId(sessionId);
    setError('');
    try {
      await revokeOwnerMechanicAccessSession(sessionId);
      setSessions((list) => list.filter((s) => s.mechanicAccessSessionId !== sessionId));
    } catch (err) {
      setError(err.message);
    } finally {
      setRevokingId('');
    }
  }

  async function copyLink() {
    if (!current?.accessUrl) return;
    await navigator.clipboard.writeText(current.accessUrl);
    setCopied(true);
  }

  const name = vehicle ? displayVehicleName(vehicle) : 'this vehicle';
  const liveSessions = useMemo(
    () => sessions.filter((s) => s.status === 'APPROVED' && s.vehicleProfileId === vehicleId),
    [sessions, vehicleId],
  );

  const tabs = [
    { id: 'link', label: 'Share link' },
    { id: 'sessions', label: 'Active sessions', count: liveSessions.length },
  ];

  if (loading) {
    return (
      <main className="ink-page access-page">
        <p className="ink-page__summary">Loading share options…</p>
      </main>
    );
  }

  return (
    <main className="ink-page access-page tv-reveal-group">
      <nav className="vehicle-crumbs" aria-label="Breadcrumb">
        <Link to="/">{t('nav.garage')}</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/vehicles/${vehicleId}`}>{name}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Share</span>
      </nav>

      <header className="ink-page__header">
        <div>
          <h1 className="ink-page__title">Share history</h1>
          <p className="ink-page__summary">
            A mechanic scans this and asks for access. You decide whether they get it.
          </p>
        </div>
        <Link className="ink-button ink-button--outline" to="/access/requests">{t('share.allRequests')}</Link>
      </header>

      <section className="ink-card access-notice">
        <span className="access-notice__icon" aria-hidden="true"><ShieldCheck size={20} /></span>
        <div>
          <h2 className="ink-section-title">The QR grants nothing on its own</h2>
          <p>
            Scanning it lets a mechanic <em>ask</em>. Until you approve, they see nothing. Once you
            do, they get read-only access to {name}'s confirmed records — no other vehicle, no
            edits — and it ends by itself {sessionDuration} after you approve. The link itself lasts
            {linkDuration}; the access it leads to lasts {sessionDuration}.
          </p>
        </div>
      </section>

      {error && <div className="ink-alert">{error}</div>}

      <Tabs tabs={tabs} activeId={view} onChange={setView} label="Sharing views" />

      <div id={`panel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`} tabIndex={-1}>
        {view === 'link' ? (
          <div className="share-grid">
            <section className="ink-card share-make">
              <h2 className="ink-section-title">{t('share.makeShort')}</h2>

              <div className="ink-combo">
                <label className="ink-combo__label" htmlFor="share-vehicle">Vehicle</label>
                <p className="ink-combo__hint" id="share-vehicle-hint">
                  One link covers one vehicle. Switching starts a link for that one instead.
                </p>
                <select
                  id="share-vehicle"
                  className="ink-select"
                  value={vehicleId}
                  aria-describedby="share-vehicle-hint"
                  onChange={(event) => navigate(`/vehicles/${event.target.value}/share`)}
                >
                  {(vehicles.length ? vehicles : [vehicle]).filter(Boolean).map((item) => (
                    <option key={item.vehicleId} value={item.vehicleId}>
                      {displayVehicleName(item)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Labelled facts, not a sentence. "Service history for {vehicle}
                  only" wrapped in this column with "only" alone on the last
                  line — the one word that limits the whole claim. */}
              <dl className="share-scope">
                <div>
                  <dt className="ink-eyebrow">Shares</dt>
                  <dd>{t('share.confirmedOnly')}</dd>
                </div>
                <div>
                  <dt className="ink-eyebrow">Of</dt>
                  <dd>{name}</dd>
                </div>
                <div>
                  <dt className="ink-eyebrow">And nothing else</dt>
                  <dd>{t('share.nothingElse')}</dd>
                </div>
                <div>
                  <dt className="ink-eyebrow">For</dt>
                  <dd>{sessionHours == null
                    ? t('share.sessionFromApprovalUnknown')
                    : t('share.sessionFromApproval', { hours: sessionHours })}</dd>
                </div>
              </dl>

              <button className="ink-button ink-button--block" type="button" onClick={handleGenerate} disabled={saving}>
                {saving ? 'Generating…' : current ? 'Generate a new link' : 'Generate share link'}
              </button>

              {current && (
                <p className="share-make__note">
                  Generating again replaces this link if nobody has used it yet, and each code
                  works for one request only. To end access someone already has, revoke it under
                  Active sessions.
                </p>
              )}
            </section>

            <section className="ink-card share-result">
              {current ? (
                <>
                  <div className="share-result__head">
                    <h2 className="ink-section-title">{current.accessUrl ? t('share.readyToScan') : 'Latest link'}</h2>
                    <span className={`ink-badge ink-badge--${statusOf(current).tone}`}>
                      {statusOf(current).labelKey ? t(statusOf(current).labelKey) : statusOf(current).text}
                    </span>
                  </div>

                  <div className="share-qr">
                    {current.accessUrl ? (
                      <QRCodeSVG value={current.accessUrl} size={196} bgColor="#ffffff" fgColor="#1c1b19" level="M" includeMargin />
                    ) : (
                      <div className="share-qr__missing">
                        {/* The server withholds the code once it cannot be scanned. A used
                            code's token belongs to the mechanic who used it now, so it is
                            never drawn here for someone else to scan or photograph. */}
                        {String(current.status).toUpperCase() === 'EXPIRED' ? (
                          <>
                            <strong>This code has expired</strong>
                            <p>It no longer opens anything. Generate a new link to share again.</p>
                          </>
                        ) : String(current.status).toUpperCase() === 'ACTIVE' ? (
                          <>
                            <strong>No share URL</strong>
                            <p>The server did not return a link, so there is nothing to encode.</p>
                          </>
                        ) : (
                          <>
                            <strong>This code has been used</strong>
                            <p>
                              A mechanic sent a request with it, so it no longer opens anything.
                              Generate a new link to share with someone else.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {current.accessUrl && (
                    <>
                  <div className="ink-combo">
                    <label className="ink-combo__label" htmlFor="share-url">Share URL</label>
                    <input id="share-url" value={current.accessUrl || ''} placeholder="Unavailable" readOnly />
                  </div>

                  <div className="share-result__actions">
                    <button className="ink-button ink-button--outline" type="button" onClick={copyLink}>
                      <Copy size={16} aria-hidden="true" />
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                    <Link className="ink-button ink-button--outline" to={`/access/request/${current.accessToken}`}>
                      <ExternalLink size={16} aria-hidden="true" />
                      {t('share.openAsMechanic')}
                    </Link>
                  </div>
                    </>
                  )}

                  <dl className="share-facts">
                    <div>
                      <dt className="ink-eyebrow">{t('share.expires')}</dt>
                      <dd>
                        {shortDateTime(current.expiresAt)}
                        {timeLeft(current.expiresAt) && (
                          <span className="share-facts__sub">{timeLeft(current.expiresAt)}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="ink-eyebrow">{t('share.recordsInScope')}</dt>
                      <dd className="ink-mono">{current.confirmedRecordCount ?? 0}</dd>
                    </div>
                  </dl>

                  {/* A phone cannot reach localhost. Said here rather than
                      letting a scan fail silently at the counter. */}
                  <p className="share-result__note">
                    Scanning from a phone needs this URL reachable from that phone — a deployed
                    address, your machine's network IP, or a tunnel. <code>localhost</code> will not
                    resolve.
                  </p>
                </>
              ) : (
                <div className="share-result__empty">
                  <h2 className="ink-empty__title">{t('share.noLink')}</h2>
                  <p className="ink-empty__body">
                    Generate one and the QR appears here, ready to show a mechanic at the counter.
                  </p>
                </div>
              )}
            </section>

            <section className="ink-card share-history">
              <h2 className="ink-section-title">Links made for {name}</h2>
              {requests.length === 0 ? (
                <p className="share-history__empty">
                  None yet. Links you make show here with their expiry, so you can see what is
                  still out there.
                </p>
              ) : (
                <ul className="share-history__list">
                  {requests.map((request) => (
                    <li key={request.qrAccessRequestId}>
                      <div>
                        <span className="share-history__when">Made {shortDateTime(request.createdAt)}</span>
                        <span className="share-history__expiry">
                          Expires {shortDateTime(request.expiresAt)}
                        </span>
                      </div>
                      <span className={`ink-badge ink-badge--${statusOf(request).tone}`}>
                        {statusOf(request).labelKey ? t(statusOf(request).labelKey) : statusOf(request).text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : liveSessions.length === 0 ? (
          <section className="ink-empty">
            <h2 className="ink-empty__title">{t('share.noOne')}</h2>
            <p className="ink-empty__body">
              Approved mechanics appear here while their access lasts, with the time they have left
              and a way to cut it short.
            </p>
            <div className="ink-empty__actions">
              <button className="ink-button" type="button" onClick={() => setView('link')}>
                {t('share.makeLink')}
              </button>
            </div>
          </section>
        ) : (
          <ul className="access-requests">
            {liveSessions.map((session) => (
              <li className="ink-card access-request" key={session.mechanicAccessSessionId}>
                <div className="access-request__head">
                  <div>
                    <h2 className="access-request__name">{session.mechanicName || 'Mechanic'}</h2>
                    <p className="access-request__shop">
                      {session.shopName || 'Shop not given'}
                      {session.contactInfo ? ` · ${session.contactInfo}` : ''}
                    </p>
                  </div>
                  <div className="access-request__meta">
                    <span className="ink-badge ink-badge--ok">{timeLeft(session.expiresAt)}</span>
                    <span className="access-request__time ink-mono">
                      Until {shortDateTime(session.expiresAt)}
                    </span>
                  </div>
                </div>

                <dl className="access-request__facts">
                  <div>
                    <dt className="ink-eyebrow">Vehicle</dt>
                    <dd>{session.vehicleLabel || name}</dd>
                  </div>
                  <div>
                    <dt className="ink-eyebrow">{t('share.permission')}</dt>
                    <dd>{t('share.readOnly')}</dd>
                  </div>
                </dl>

                <div className="access-request__actions">
                  <Link className="ink-button ink-button--outline" to={`/mechanic/access/${session.mechanicAccessSessionId}`}>
                    See what they see
                  </Link>
                  <button
                    className="ink-button ink-button--danger-outline"
                    type="button"
                    disabled={revokingId === session.mechanicAccessSessionId}
                    onClick={() => revoke(session.mechanicAccessSessionId)}
                  >
                    {revokingId === session.mechanicAccessSessionId ? 'Revoking…' : 'Revoke now'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
