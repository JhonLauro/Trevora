import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CircleCheck, CircleX, Clock3, QrCode, ShieldCheck } from 'lucide-react';
import Tabs from '../components/ink/Tabs.jsx';
import {
  approveMechanicAccessRequest,
  denyMechanicAccessRequest,
  getMechanicAccessRequests,
  getOwnerMechanicAccessSessions,
} from '../api/qrAccess';
import { getVehicles } from '../api/vehicles';
import { displayVehicleName } from '../utils/vehicleText';
import { pluralize } from '../utils/format';

/**
 * Every mechanic who has asked to see one of this owner's vehicles.
 *
 * Two things were wrong before, and the first was a dead end:
 *
 * **"Generate QR" could navigate to the Garage.** The tab was a link built
 * from `localStorage['trevora.activeVehicleId']`, falling back to the first
 * request's vehicle, falling back to `/vehicles` — and `/vehicles` is a
 * redirect to `/`. So on a fresh account with no requests yet, the button
 * for the page's main action silently dumped you on the dashboard. Worse, the
 * only code that ever *writes* that localStorage key is the share page you
 * reach through this link, so the fallback could never resolve itself.
 *
 * Sharing is scoped to one vehicle, so the page now asks which one, from the
 * owner's actual vehicle list: straight through when there is only one,
 * a picker when there are several, and an honest prompt when there are none.
 *
 * **Everything was fetched per-filter.** Switching status refetched, and no
 * count was known for any status but the one on screen. One fetch now brings
 * all of them, so the tabs can carry counts and switching is instant.
 */

const TONES = { PENDING: 'warn', APPROVED: 'ok', DENIED: 'bad' };
const LABELS = { PENDING: 'Waiting on you', APPROVED: 'Approved', DENIED: 'Denied' };

const FILTERS = [
  { id: 'PENDING', label: 'Pending' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'DENIED', label: 'Denied' },
  { id: 'ALL', label: 'All' },
];

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function statusOf(request) {
  return String(request.status || '').toUpperCase();
}

/** How sharing works, for the owner who has never done it. */
function HowItWorks() {
  const steps = [
    { icon: QrCode, title: 'You generate a link', body: 'Open a vehicle and create a share link or QR code. It expires on its own.' },
    { icon: Clock3, title: 'The mechanic asks', body: 'Scanning it lets them request access. It grants nothing on its own.' },
    { icon: ShieldCheck, title: 'You decide', body: 'Approve and they get read-only access to that one vehicle. Deny and nothing is shared.' },
  ];

  return (
    <section className="ink-card access-how">
      <h2 className="ink-section-title">How sharing works</h2>
      <ol>
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="access-how__step" aria-hidden="true">
              <step.icon size={18} />
            </span>
            <div>
              <strong><span className="ink-mono access-how__num">{index + 1}</span> {step.title}</strong>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The page's primary action, and the thing that used to be broken.
 *
 * A share link belongs to one vehicle, so this never guesses which — it
 * either knows (one vehicle) or asks (several), and says so plainly when
 * there is nothing to share yet.
 */
function ShareControl({ vehicles, loading }) {
  const navigate = useNavigate();
  const [chosen, setChosen] = useState('');

  if (loading) return null;

  if (vehicles.length === 0) {
    return (
      <Link className="ink-button ink-button--outline" to="/vehicles/new">
        Add a vehicle first
      </Link>
    );
  }

  if (vehicles.length === 1) {
    return (
      <Link className="ink-button" to={`/vehicles/${vehicles[0].vehicleId}/share`}>
        Share {displayVehicleName(vehicles[0])}
      </Link>
    );
  }

  return (
    <div className="access-share">
      <label className="ink-sr-only" htmlFor="share-which">Vehicle to share</label>
      <select
        id="share-which"
        className="ink-select"
        value={chosen}
        onChange={(event) => setChosen(event.target.value)}
      >
        <option value="">Choose a vehicle…</option>
        {vehicles.map((vehicle) => (
          <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
            {displayVehicleName(vehicle)}
          </option>
        ))}
      </select>
      <button
        className="ink-button"
        type="button"
        disabled={!chosen}
        onClick={() => navigate(`/vehicles/${chosen}/share`)}
      >
        Generate QR
      </button>
    </div>
  );
}

export default function OwnerAccessRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [filter, setFilter] = useState('PENDING');
  const [decision, setDecision] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    // One fetch for everything. The old page refetched on every filter change
    // and still could not show a count for any status but the current one.
    Promise.all([
      getMechanicAccessRequests(''),
      getOwnerMechanicAccessSessions('APPROVED'),
      getVehicles(),
    ])
      .then(([requestData, sessionData, vehicleData]) => {
        if (!active) return;
        setRequests(requestData ?? []);
        setSessions(sessionData ?? []);
        setVehicles(vehicleData ?? []);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const counts = useMemo(() => {
    const tally = { PENDING: 0, APPROVED: 0, DENIED: 0 };
    requests.forEach((request) => {
      const status = statusOf(request);
      if (tally[status] !== undefined) tally[status] += 1;
    });
    return tally;
  }, [requests]);

  const shown = useMemo(() => (
    filter === 'ALL' ? requests : requests.filter((request) => statusOf(request) === filter)
  ), [requests, filter]);

  const liveSessions = sessions.filter((session) => session.status === 'APPROVED');

  async function decide(requestId, action) {
    setSavingId(requestId);
    setError('');
    try {
      const response = action === 'approve'
        ? await approveMechanicAccessRequest(requestId)
        : await denyMechanicAccessRequest(requestId);
      setDecision(response);
      setRequests((current) => current.map((request) => (
        request.mechanicAccessRequestId === requestId ? response.request : request
      )));
      if (response.session) setSessions((current) => [response.session, ...current]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId('');
    }
  }

  const tabs = FILTERS.map((entry) => ({
    ...entry,
    count: entry.id === 'ALL' ? requests.length : counts[entry.id],
  }));

  return (
    <main className="ink-page access-page">
      <header className="ink-page__header">
        <div>
          <h1 className="ink-page__title">Shared access</h1>
          <p className="ink-page__summary">
            Every mechanic who has asked to see one of your vehicles, and what you decided.
          </p>
        </div>
        <ShareControl vehicles={vehicles} loading={loading} />
      </header>

      <section className="access-summary" aria-label="Access at a glance">
        <div className="access-summary__cell">
          <span className="ink-eyebrow">Waiting on you</span>
          <strong className={counts.PENDING > 0 ? 'is-live' : undefined}>{counts.PENDING}</strong>
        </div>
        <div className="access-summary__cell">
          <span className="ink-eyebrow">Approved</span>
          <strong>{counts.APPROVED}</strong>
        </div>
        <div className="access-summary__cell">
          <span className="ink-eyebrow">Denied</span>
          <strong>{counts.DENIED}</strong>
        </div>
        <div className="access-summary__cell">
          <span className="ink-eyebrow">Active right now</span>
          <strong className={liveSessions.length > 0 ? 'is-live' : undefined}>{liveSessions.length}</strong>
        </div>
      </section>

      <section className="ink-card access-notice">
        <span className="access-notice__icon" aria-hidden="true"><ShieldCheck size={20} /></span>
        <div>
          <h2 className="ink-section-title">Nothing is shared until you approve it</h2>
          <p>
            A mechanic who scans your QR can ask, and nothing more. Approving grants read-only access
            to that one vehicle's confirmed records, and it expires on its own. They can never edit,
            delete, or add anything.
          </p>
        </div>
      </section>

      {error && <div className="ink-alert">{error}</div>}

      {decision?.session && (
        <div className="ink-notice ink-notice--ok" role="status">
          Approved — access ends {formatDateTime(decision.session.expiresAt)}.{' '}
          <Link to={`/mechanic/access/${decision.session.mechanicAccessSessionId}`}>
            See what the mechanic sees
          </Link>
        </div>
      )}
      {decision && !decision.session && (
        <div className="ink-notice" role="status">
          Denied. Nothing was shared.
        </div>
      )}

      <Tabs tabs={tabs} activeId={filter} onChange={setFilter} label="Filter requests by status" />

      <div id={`panel-${filter}`} role="tabpanel" aria-labelledby={`tab-${filter}`} tabIndex={-1}>
        {loading ? (
          <p className="ink-page__summary">Loading requests…</p>
        ) : shown.length === 0 ? (
          <div className="access-empty">
            <section className="ink-empty">
              <h2 className="ink-empty__title">
                {filter === 'PENDING' ? 'Nothing waiting on you' : 'No requests here'}
              </h2>
              <p className="ink-empty__body">
                {requests.length === 0
                  ? 'No mechanic has asked for access yet. That starts when you share a vehicle and someone scans the link.'
                  : `Nothing under ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}. Try another tab.`}
              </p>
            </section>
            {requests.length === 0 && <HowItWorks />}
          </div>
        ) : (
          <ul className="access-requests">
            {shown.map((request) => {
              const status = statusOf(request);
              const busy = savingId === request.mechanicAccessRequestId;

              return (
                <li className="ink-card access-request" key={request.mechanicAccessRequestId}>
                  <div className="access-request__head">
                    <div>
                      <h2 className="access-request__name">{request.mechanicName || 'Mechanic'}</h2>
                      <p className="access-request__shop">
                        {request.shopName || 'Shop not given'}
                        {request.contactInfo ? ` · ${request.contactInfo}` : ''}
                      </p>
                    </div>
                    <div className="access-request__meta">
                      <span className={`ink-badge ink-badge--${TONES[status] ?? 'none'}`}>
                        {LABELS[status] ?? status}
                      </span>
                      <span className="access-request__time ink-mono">
                        {formatDateTime(request.requestedAt)}
                      </span>
                    </div>
                  </div>

                  <dl className="access-request__facts">
                    <div>
                      <dt className="ink-eyebrow">Vehicle</dt>
                      <dd>{request.vehicleLabel || 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt className="ink-eyebrow">Permission</dt>
                      <dd>Read-only, this vehicle only</dd>
                    </div>
                    <div>
                      <dt className="ink-eyebrow">Reason given</dt>
                      <dd>{request.reason || 'None given'}</dd>
                    </div>
                  </dl>

                  {status === 'PENDING' && (
                    <div className="access-request__actions">
                      <button
                        className="ink-button"
                        type="button"
                        disabled={busy}
                        onClick={() => decide(request.mechanicAccessRequestId, 'approve')}
                      >
                        <CircleCheck size={17} aria-hidden="true" />
                        {busy ? 'Working…' : 'Approve read-only access'}
                      </button>
                      <button
                        className="ink-button ink-button--danger-outline"
                        type="button"
                        disabled={busy}
                        onClick={() => decide(request.mechanicAccessRequestId, 'deny')}
                      >
                        <CircleX size={17} aria-hidden="true" />
                        Deny
                      </button>
                    </div>
                  )}

                  {status === 'APPROVED' && (
                    <p className="access-request__note">
                      {pluralize(liveSessions.filter((s) => s.vehicleProfileId === request.vehicleProfileId).length, 'session')} active
                      for this vehicle. Manage or end it from the vehicle's share page.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
