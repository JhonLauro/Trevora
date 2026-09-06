import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MechanicAISearchPanel from '../components/MechanicAISearchPanel';
import PartsView from '../components/ink/PartsView.jsx';
import Tabs from '../components/ink/Tabs.jsx';
import { getMechanicSessionHistory } from '../api/mechanicAccess';
import { componentStatuses } from '../utils/componentStatus';
import { formatAmount, formatDate, formatOdometer, pluralize } from '../utils/format';
import { noticedAgo } from '../utils/noticedAgo';
import { historyGaps, odometerFindings, recurringWork, trustSummary } from '../utils/mechanicBriefing';
import { needsReview, sourceLabel } from '../utils/recordStatus';
import { serviceItemsPartsInline, serviceItemsSummaryLabel } from '../utils/serviceText';
import { vehicleClassFor } from '../data/vehicleCatalog';

/**
 * What a mechanic sees after the owner approves them.
 *
 * Built as a briefing, not a dashboard. A mechanic reads this at a counter
 * with a customer waiting, so the order is the order of the questions they
 * arrive with: what is this vehicle, can I believe the history, what does it
 * say, and only then anything derived from it.
 *
 * Two things this screen must not do, both of which it used to:
 *
 * - **Claim every record is validated.** The page hardcoded a "Validated"
 *   badge on every shared record. Migration 009 exists precisely because that
 *   was being done to owners; doing it to the mechanic is worse, because they
 *   act on it. Status now comes from the record.
 * - **Open on a wall of zeros.** Four counters reading 0 told a mechanic
 *   nothing. An undocumented vehicle is a finding, and it is now written as
 *   one sentence that says so.
 */

/* Search is a tool for a long history, and on a three-record vehicle reading
   the list really is faster than describing what you want from it. That was
   the reasoning for hiding the panel below four records, and as a UX argument
   it still holds.

   It is set to 1 anyway, because it was answering the wrong question. The
   mechanic cannot know whether searching is worth it until they have already
   read the list -- and a vehicle whose history is short today grows. Hiding
   the feature on small histories mostly meant it was invisible on exactly the
   vehicles people demo and test with, so it read as missing rather than as
   considerately withheld.

   Zero is still the floor: with no records the page shows the undocumented
   vehicle state instead, and there is nothing to search. */
const SEARCH_WORTH_SHOWING = 1;

const VIEWS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'components', label: 'Components' },
  { id: 'table', label: 'Table' },
];

/* The search already works out which view answers the question -- a question
   about a part belongs on the components map, a "when was it last..." on the
   timeline -- and returns that as recommendedView. The page used to drop it on
   the floor, so the mechanic got their answer and then had to go find the
   right tab by hand, which is the exact cost this feature exists to remove.

   The two sides also named one view differently: the API says "parts-map",
   the tabs say "components". Mapped rather than renamed, because the API name
   is part of a response contract other callers may already read. */
const VIEW_FOR_RECOMMENDATION = {
  'parts-map': 'components',
  timeline: 'timeline',
  table: 'table',
};

function expiryLabel(expiresAt) {
  if (!expiresAt) return 'Session active';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  // A clock time is checkable against the clock on the wall; "240 min" is
  // arithmetic the reader has to do.
  const clock = new Date(expiresAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const hours = Math.floor(ms / 3600000);
  return hours >= 1 ? `Until ${clock} · ${pluralize(hours, 'hour')} left` : `Until ${clock}`;
}

function hasReceipt(record) {
  return Boolean(record.receiptStoragePath || record.fieldMetadata?.storedReceiptPages?.some((page) => page?.path));
}

/* Newest first, established here rather than assumed from the response.
   Every derived figure on this page — the current odometer, the timeline
   order, which reading counts as "latest" — depends on it, and a briefing
   that silently reorders itself because an endpoint changed its sort is
   worse than one that never claimed an order. Undated records sink to the
   bottom instead of pretending to a position. */
function newestFirst(records) {
  return [...records].sort((a, b) => String(b.serviceDate || '').localeCompare(String(a.serviceDate || '')));
}

function groupByYear(records) {
  const groups = [];
  records.forEach((record) => {
    const year = record.serviceDate ? new Date(`${record.serviceDate}T00:00:00`).getFullYear() : 'Undated';
    const existing = groups.find((group) => group.year === year);
    if (existing) existing.records.push(record);
    else groups.push({ year, records: [record] });
  });
  return groups.sort((a, b) => String(b.year).localeCompare(String(a.year)));
}

/** One line stating what this history is, in place of four counters. */
/**
 * Manufacturer warranty, at the top of the page.
 *
 * <p><b>Why a mechanic is shown this when they are shown no other owner
 * finances.</b> What an insurer paid on a past visit is the owner's private
 * arrangement and is deliberately withheld. This is not that. Work done outside
 * the dealer network can void cover the owner is still relying on, so whether
 * the vehicle is under warranty decides whether this shop should be opening it
 * up at all — and a mechanic who cannot see it finds out afterwards.
 *
 * <p>Rendered even when nothing is recorded, which is the opposite of the rule
 * the Briefing below follows. Absence of a warranty record is not evidence of
 * an expired warranty, and a mechanic who sees no warranty block will read the
 * silence as "out of cover, go ahead" — the one wrong conclusion this is here
 * to prevent. It says the status is unknown instead.
 *
 * <p>The status, the remaining distance and the expiry date are all computed on
 * the backend, by the same resolver that answers the owner's own page. Nothing
 * is recalculated here: these two people must never be told different things
 * about the same car.
 */
function WarrantyNotice({ warranty }) {
  if (!warranty) return null;

  const km = (value) => `${Number(value).toLocaleString()} km`;
  const status = warranty.status;
  const covered = status === 'ACTIVE' || status === 'MILEAGE_ONLY' || status === 'TIME_ONLY';

  let heading;
  if (covered) {
    heading = warranty.expiringSoon
      ? 'Manufacturer warranty — ending soon'
      : 'Under manufacturer warranty';
  } else if (status === 'EXPIRED') {
    heading = 'Manufacturer warranty has ended';
  } else {
    heading = 'Warranty status unknown';
  }

  const lines = [];
  if (warranty.expiryDate && warranty.kmLimit != null) {
    lines.push(`Until ${formatDate(warranty.expiryDate)} or ${km(warranty.kmLimit)} — whichever comes first.`);
  } else if (warranty.expiryDate) {
    lines.push(`Until ${formatDate(warranty.expiryDate)}.`);
  } else if (warranty.kmLimit != null) {
    lines.push(`Up to ${km(warranty.kmLimit)}.`);
  }

  if (warranty.currentKm != null && warranty.kmRemaining != null) {
    lines.push(warranty.kmRemaining > 0
      ? `${km(warranty.currentKm)} recorded · ${km(warranty.kmRemaining)} remaining.`
      : `${km(warranty.currentKm)} recorded · ${km(Math.abs(warranty.kmRemaining))} past the limit.`);
  } else if (warranty.currentKm != null) {
    lines.push(`${km(warranty.currentKm)} recorded.`);
  }

  /* The half that could not be checked, named. A vehicle with no purchase date
     on file is not "under warranty" in the way a complete record is, and a
     mechanic acting on the distance alone should know the clock was never
     looked at. */
  if (covered && !warranty.expiryDate) {
    lines.push('No purchase date on file, so the time limit has not been checked.');
  }
  if (covered && warranty.kmLimit != null && warranty.currentKm == null) {
    lines.push('No odometer reading on file, so the distance limit has not been checked.');
  }
  if (status === 'NOT_SET' || status === 'INCOMPLETE') {
    lines.push('The owner has not recorded enough of their coverage terms to say either way. Ask before doing work that could affect a manufacturer warranty.');
  }

  return (
    <section className="ink-card mechanic-warranty">
      <span className="ink-eyebrow">Coverage</span>
      <h2 className="ink-section-title">{heading}</h2>
      {lines.map((line) => (
        <p className="mechanic-warranty__line" key={line}>{line}</p>
      ))}
      {/* Full size and in ordinary ink, not fine print. Trevora has confirmed
          none of this with a dealer, and a shop deciding whether to touch a
          covered vehicle is entitled to know exactly how good the information
          is. */}
      <p className="mechanic-warranty__source">
        Based on information provided by the owner. Trevora has not confirmed it with a dealer.
      </p>
    </section>
  );
}

function Summary({ records, trust, odometer, warranty }) {
  if (records.length === 0) return null;

  const years = records
    .filter((record) => record.serviceDate)
    .map((record) => new Date(record.serviceDate).getFullYear());
  const span = years.length
    ? (Math.min(...years) === Math.max(...years)
      ? String(Math.min(...years))
      : `${Math.min(...years)}–${Math.max(...years)}`)
    : null;
  /* The highest reading known for the vehicle, as the backend computed it for
     the warranty block above — not the most recent one. Two numbers under the
     same word on one page is the disagreement this replaced: receipts get filed
     out of order, so "the newest record carrying a reading" can be lower than
     one filed before it. Falls back to the old scan only if the payload
     predates the warranty block. */
  const highest = warranty?.currentKm ?? records.find((record) => record.odometer != null)?.odometer ?? null;

  /* Each cell is dropped rather than shown empty: an odometer nobody wrote
     down is not "0 km", and a single-year history has no span to state. */
  const cells = [
    ['Records', pluralize(records.length, 'record'), null],
    span ? ['Covering', span, null] : null,
    highest != null ? ['Odometer', formatOdometer(highest), null] : null,
    odometer.kmPerYear ? ['Yearly use', `about ${formatAmount(odometer.kmPerYear)} km`, null] : null,
    /* The one cell that can carry a warning. It says what is unverified rather
       than asserting the rest is sound -- the same restraint the record badges
       keep. */
    trust.unverified > 0
      ? ['Not yet reviewed', pluralize(trust.unverified, 'record'), 'warn']
      : null,
  ].filter(Boolean);

  return (
    <section className="ink-card mechanic-facts">
      {cells.map(([label, value, tone]) => (
        <div className="mechanic-fact" key={label}>
          <span className="ink-eyebrow">{label}</span>
          <span className={`mechanic-fact__value${tone ? ` mechanic-fact__value--${tone}` : ''}`}>
            {value}
          </span>
        </div>
      ))}
    </section>
  );
}

/**
 * What the owner says is wrong, in their words.
 *
 * Placed above everything the page infers -- the briefing, the history, the
 * search -- because it is the only thing here nobody derived. The briefing
 * reasons from gaps and repeat visits and can be wrong; this is the owner
 * telling you what the car is doing. Keeping the two visually separate is the
 * point: folded into "Worth knowing" it would read as another inference.
 *
 * Nothing here is interactive. The session is read-only and lasts minutes.
 * No open concerns renders nothing at all -- an empty state here would be
 * telling a mechanic about an absence they cannot do anything about.
 */
function OwnerConcerns({ concerns }) {
  if (!concerns || concerns.length === 0) return null;

  return (
    <section className="ink-card mechanic-concerns">
      <h2 className="ink-section-title">What the owner has noticed</h2>
      <ul>
        {concerns.map((concern) => (
          <li className="mechanic-concern" key={concern.concernId}>
            <p className="mechanic-concern__note">{concern.note}</p>
            <span className="mechanic-concern__age">{noticedAgo(concern.noticedAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The findings, when there are any.
 *
 * Deliberately absent rather than reassuring when nothing is found: a panel
 * saying "no problems detected" would be claiming the absence of problems
 * from the absence of paperwork, which is the thing this whole screen is
 * careful not to do.
 */
function Briefing({ odometer, gaps, recurring, trust }) {
  const notes = [];

  odometer.inconsistencies.forEach((issue) => {
    notes.push({
      tone: 'bad',
      key: `odo-${issue.to.recordId}`,
      title: 'Odometer readings disagree',
      body: `${formatDate(issue.from.serviceDate)} recorded ${formatOdometer(issue.from.odometer)}, then ${formatDate(issue.to.serviceDate)} recorded ${formatOdometer(issue.to.odometer)} — ${formatAmount(issue.drop)} km lower. A mistyped reading looks the same as a wound-back one; worth asking about either way.`,
    });
  });

  if (trust.unverified > 0) {
    notes.push({
      tone: 'warn',
      key: 'trust',
      title: `${pluralize(trust.unverified, 'record')} not verified by the owner`,
      body: 'Extracted from a receipt or a voice note and confirmed without anyone correcting the fields. Not wrong — unchecked.',
    });
  }

  if (gaps.years.length > 0) {
    notes.push({
      tone: 'warn',
      key: 'gaps',
      title: `Nothing filed for ${gaps.years.join(', ')}`,
      body: `Between ${gaps.firstYear} and ${gaps.lastYear} these years have no records. That is a gap in the paperwork — it does not establish that no work was done.`,
    });
  }

  recurring.forEach((item) => {
    notes.push({
      tone: 'warn',
      key: `recur-${item.component}`,
      title: `${item.label} serviced ${item.count} times in two years`,
      body: 'Repeat work on one component inside a short window is worth a look before quoting more of it.',
    });
  });

  if (notes.length === 0) return null;

  return (
    <section className="ink-card mechanic-briefing">
      <h2 className="ink-section-title">Worth knowing</h2>
      <ul>
        {notes.map((note) => (
          <li key={note.key} className={`mechanic-note mechanic-note--${note.tone}`}>
            <strong>{note.title}</strong>
            <p>{note.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecordCard({ record, href }) {
  return (
    <article className="ink-card mechanic-record">
      <div className="mechanic-record__head">
        <div>
          <h3>{serviceItemsSummaryLabel(record.services)}</h3>
          <p className="mechanic-record__shop">{record.shopName || 'Shop not recorded'}</p>
        </div>
        <span className={`ink-badge ink-badge--${needsReview(record) ? 'warn' : 'ok'}`}>
          {needsReview(record) ? 'Unverified' : 'Owner verified'}
        </span>
      </div>

      <p className="mechanic-record__parts">{serviceItemsPartsInline(record.services, 'No parts listed')}</p>

      <div className="mechanic-record__facts">
        <span className="ink-mono">{formatDate(record.serviceDate)}</span>
        <span className="ink-mono">{formatOdometer(record.odometer, 'No odometer')}</span>
        <span>{sourceLabel(record.sourceInputMethod)}</span>
        {hasReceipt(record) && <span>Receipt attached</span>}
      </div>

      <Link className="ink-link-button" to={href}>Open record</Link>
    </article>
  );
}

export default function MechanicAccessSessionPlaceholderPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [view, setView] = useState('timeline');

  function handleSearch(result) {
    setSearchResult(result);
    // Only ever move the mechanic towards an answer: clearing the search
    // leaves them on whatever view they were reading.
    const suggested = VIEW_FOR_RECOMMENDATION[result?.recommendedView];
    if (suggested) {
      setView(suggested);
    }
  }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

    return () => { active = false; };
  }, [sessionId]);

  const records = useMemo(() => newestFirst(history?.records ?? []), [history]);
  const matched = useMemo(() => (searchResult ? newestFirst(searchResult.records ?? []) : null), [searchResult]);
  const visible = matched ?? records;
  const vehicleClass = vehicleClassFor(history?.vehicleBodyType);

  const trust = useMemo(() => trustSummary(records), [records]);
  const odometer = useMemo(() => odometerFindings(records), [records]);
  const gaps = useMemo(() => historyGaps(records), [records]);
  const recurring = useMemo(() => recurringWork(records, vehicleClass), [records, vehicleClass]);
  const components = useMemo(
    () => componentStatuses(visible, { bodyType: history?.vehicleBodyType ?? null }),
    [visible, history],
  );
  const grouped = useMemo(() => groupByYear(visible), [visible]);

  const recordHref = (id) => `/mechanic/access/${sessionId}/history/${id}`;

  if (loading) {
    return (
      <main className="ink-page mechanic-page">
        <p className="ink-page__summary">Loading the shared history…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="ink-page mechanic-page">
        <section className="ink-empty">
          <h1 className="ink-empty__title">Access unavailable</h1>
          <p className="ink-empty__body">{error}</p>
          <p className="ink-empty__body">
            Shared links expire on their own, and the owner can end access early. Ask them for a new
            link if you still need it.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="ink-page mechanic-page tv-reveal-group">
      <header className="mechanic-header">
        <div>
          <span className="ink-eyebrow">Shared by the owner · read only</span>
          <h1 className="ink-page__title">{history.vehicleLabel}</h1>
          {/* The plate is shown here and nowhere earlier: this page exists only
              once the owner has approved, which is the point at which
              confirming the right vehicle is worth disclosing it. It is also
              the thing a mechanic can check against the car in front of them,
              which the make and model alone cannot settle in a yard of
              identical Civics. */}
          {history.plateNumber && (
            <p className="mechanic-header__plate ink-mono">{history.plateNumber}</p>
          )}
        </div>
        <span className="ink-badge ink-badge--none mechanic-header__expiry">
          {expiryLabel(history.expiresAt)}
        </span>
      </header>

      {/* Above the summary and the history: it is the one fact on this page
          that can change whether the work happens here at all. */}
      <WarrantyNotice warranty={history.warranty} />

      <Summary records={records} trust={trust} odometer={odometer} warranty={history.warranty} />

      {/* Above the empty-history branch as well as the populated one: a vehicle
          with nothing filed can still have an owner saying the AC is dead, and
          that is the most useful thing on the page when there is no history to
          read. */}
      <OwnerConcerns concerns={history.openConcerns} />

      {records.length === 0 ? (
        <section className="ink-empty">
          {/* An empty history is a finding, not a blank screen. Said once,
              plainly, instead of as four counters reading zero. */}
          <h2 className="ink-empty__title">This vehicle has no documented history</h2>
          <p className="ink-empty__body">
            The owner shared access, but nothing has been confirmed against this vehicle yet. Treat
            its service history as unknown rather than as empty — an undocumented vehicle is not the
            same as an unserviced one.
          </p>
        </section>
      ) : (
        <>
          {/* First thing on the page. It used to sit under the history, on the
              reasoning that a short list is faster to read than to describe --
              which is true, but it assumed the mechanic arrives wanting to
              read. They usually arrive with a question, and burying the place
              to ask it behind the whole history is the delay this feature
              exists to remove. */}
          {records.length >= SEARCH_WORTH_SHOWING && (
            <MechanicAISearchPanel sessionId={sessionId} onSearch={handleSearch} />
          )}

          <Briefing odometer={odometer} gaps={gaps} recurring={recurring} trust={trust} />

          <Tabs tabs={VIEWS} activeId={view} onChange={setView} label="History views" />

          <div id={`panel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`} tabIndex={-1}>
            {matched && (
              <p className="mechanic-filter-note">
                Showing {visible.length} of {records.length} records matching your question.{' '}
                <button className="ink-link-button" type="button" onClick={() => setSearchResult(null)}>
                  Show all
                </button>
              </p>
            )}

            {visible.length === 0 ? (
              <section className="ink-empty">
                <h2 className="ink-empty__title">Nothing matches that</h2>
                <p className="ink-empty__body">Try a component, a shop, or the kind of work.</p>
              </section>
            ) : view === 'components' ? (
              <PartsView
                entries={components}
                vehicleClass={vehicleClass}
                bodyType={history.vehicleBodyType ?? null}
                recordHref={(record) => recordHref(record.recordId)}
              />
            ) : view === 'table' ? (
              <section className="ink-table-card">
                <table className="ink-table mechanic-table" aria-label="Shared service records">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Service</th>
                      <th scope="col">Shop</th>
                      <th scope="col">Odometer</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((record) => (
                      <tr key={record.recordId} onClick={() => navigate(recordHref(record.recordId))}>
                        <td className="ink-mono">{formatDate(record.serviceDate)}</td>
                        <td>{serviceItemsSummaryLabel(record.services)}</td>
                        <td>{record.shopName || 'Not recorded'}</td>
                        <td className="ink-mono">{formatOdometer(record.odometer, '—')}</td>
                        <td>
                          <span className={`ink-badge ink-badge--${needsReview(record) ? 'warn' : 'ok'}`}>
                            {needsReview(record) ? 'Unverified' : 'Verified'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : (
              <div className="mechanic-timeline">
                {grouped.map((group) => (
                  <section className="mechanic-timeline__year" key={group.year}>
                    <div className="mechanic-timeline__head">
                      <h2>{group.year}</h2>
                      <span aria-hidden="true" />
                      <small>{pluralize(group.records.length, 'record')}</small>
                    </div>
                    {group.records.map((record) => (
                      <RecordCard key={record.recordId} record={record} href={recordHref(record.recordId)} />
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>

        </>
      )}

      <footer className="mechanic-footer">
        <p>
          You are seeing confirmed service records for this one vehicle. Nothing here can be edited,
          and access ends on its own.
        </p>
        <Link to="/login">Owner sign in</Link>
      </footer>
    </main>
  );
}
