import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText, Mic, PenLine, TrendingDown, TrendingUp } from 'lucide-react';
import MonthBars from '../components/ink/MonthBars.jsx';
import RecordsTable from '../components/ink/RecordsTable.jsx';
import useGarage from '../hooks/useGarage.js';
import { getActiveCurrentUser, getUserDisplayName } from '../api/currentUser.js';
import { getPendingMechanicAccessRequests } from '../api/qrAccess.js';
import { formatAmount, formatMonthYear, pluralize, relativeDays } from '../utils/format';
import {
  allTimeSeries, lastTwelveMonths, monthSeries, peakMonth, previousPeriodTotal, seriesTotal,
} from '../utils/monthlySeries';
import { needsReview } from '../utils/recordStatus';
import { listServiceDrafts } from '../api/serviceDrafts';
import { spendTotals } from '../utils/spend';
import { spendByCategory } from '../utils/serviceCategory';
import { displayVehicleName, displayVehicleSubtitle } from '../utils/vehicleText';

/* Card width belongs to the stylesheet (496px desktop, 318px mobile), not to
   this file — a second copy of the breakpoint in JS is a second thing to get
   wrong. The carousel measures the rendered card instead and pages by however
   many whole cards fit. */
const CARD_GAP = 24;

function greetingFor(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** A value longer than about nine characters drops a type step rather than
    overflowing its cell. The label above it never shrinks. */
function statValueClass(value) {
  return `garage-stat__value${String(value).length > 9 ? ' garage-stat__value--long' : ''}`;
}

function Stat({ label, value, note = null }) {
  return (
    <div className="garage-stat">
      <span className="ink-eyebrow">{label}</span>
      <span className={statValueClass(value)}>{value}</span>
      {note && <span className="garage-stat__note">{note}</span>}
    </div>
  );
}

function VehicleCard({ vehicle, records }) {
  const vehicleId = vehicle.vehicleId;
  const reviewCount = records.filter(needsReview).length;
  // Out-of-pocket, with anything covered called out underneath rather than
  // folded in — see utils/spend.js.
  const spend = spendTotals(records);
  const series = lastTwelveMonths(records);
  const name = displayVehicleName(vehicle);

  return (
    <article className="garage-card">
      <div className="garage-card__head">
        <div>
          <h3 className="garage-card__name">{name}</h3>
          <p className="garage-card__meta">{displayVehicleSubtitle(vehicle)}</p>
        </div>
        {/* "All validated" on a car with no records at all would be a claim
            about nothing. An empty card says so plainly instead. */}
        {records.length === 0 ? (
          <span className="ink-badge ink-badge--none">No records yet</span>
        ) : reviewCount > 0 ? (
          <span className="ink-badge ink-badge--warn">{pluralize(reviewCount, 'needs review', 'need review')}</span>
        ) : (
          <span className="ink-badge ink-badge--ok">All validated</span>
        )}
      </div>

      <div className="garage-card__stats">
        <Stat label="Records" value={String(records.length)} />
        <Stat
          label="Spend, PHP"
          value={formatAmount(spend.ownerPaid)}
          note={spend.hasCoverage ? `${formatAmount(spend.covered)} covered` : null}
        />
        <Stat label="Last service" value={records[0]?.serviceDate ? formatMonthYear(records[0].serviceDate) : 'None yet'} />
      </div>

      {/* Twelve empty bars and a date range is a chart of nothing — the most
          visibly empty thing on an empty garage, and it says less than the
          "0" above it already did. A car with no records says what the chart
          will become instead. */}
      {records.length === 0 ? (
        <p className="garage-card__chart-empty">
          Add a record and twelve months of service activity chart here.
        </p>
      ) : (
        <div className="garage-card__chart">
          <MonthBars
            series={series}
            showRange
            label={`Service activity for ${name} over the last 12 months`}
          />
        </div>
      )}

      <div className="garage-card__actions">
        <Link className="ink-button ink-button--sm" to={`/service-input/${vehicleId}`}>Add record</Link>
        <Link className="ink-button ink-button--outline ink-button--sm" to={`/vehicles/${vehicleId}`}>Open vehicle</Link>
      </div>
    </article>
  );
}

/**
 * The vehicle row.
 *
 * Was a paged carousel: the track translated by a measured page width, arrows
 * stepped whole pages, and "1-2 of 6" told you where you were. Six vehicles
 * meant three pages of arrow-clicking, and nobody does that twice.
 *
 * It scrolls natively now — one scroller, scroll-snap, arrows that nudge it by
 * a card. That deletes the ResizeObserver, the per-page arithmetic and the
 * transform offset, and swipe, trackpad, keyboard and scrollbar all come from
 * the browser instead of from us.
 *
 * A list view lived here briefly as an alternative for larger garages. It was
 * removed: even carrying the activity strip and the status badges it read as
 * thinner than the cards it replaced, and a second layout that is worse than
 * the first is not a choice worth offering.
 */
function VehicleCarousel({ garages }) {
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const single = garages.length === 1;

  /* Which arrows are usable, from the scroller itself rather than from a page
     index we would otherwise have to keep in step with it. */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    function measure() {
      const { scrollLeft, scrollWidth, clientWidth } = track;
      setAtStart(scrollLeft <= 1);
      setAtEnd(scrollLeft + clientWidth >= scrollWidth - 1);
    }

    measure();
    track.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => {
      track.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [garages.length]);

  function nudge(direction) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector('.garage-card');
    const step = card ? card.getBoundingClientRect().width + CARD_GAP : track.clientWidth;
    track.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  return (
    <section
      className={`garage-carousel tv-reveal${single ? ' garage-carousel--single' : ''}`}
      style={{ '--reveal-index': 1 }}
    >
      <div className="garage-carousel__head">
        <h2 className="ink-section-title">Your vehicles</h2>
        <div className="garage-carousel__controls">
          <Link className="ink-button ink-button--outline garage-carousel__add" to="/vehicles/new">
            Add vehicle
          </Link>

          {!single && (
            <>
              <button
                className="garage-carousel__arrow"
                type="button"
                aria-label="Scroll vehicles left"
                disabled={atStart}
                onClick={() => nudge(-1)}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                className="garage-carousel__arrow"
                type="button"
                aria-label="Scroll vehicles right"
                disabled={atEnd}
                onClick={() => nudge(1)}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      <div
        className="garage-track"
        ref={trackRef}
        tabIndex={single ? -1 : 0}
        role={single ? undefined : 'group'}
        aria-label={single ? undefined : 'Vehicles, scrollable'}
      >
        <div className="garage-track__row">
          {garages.map(({ vehicle, records }) => (
            <VehicleCard key={vehicle.vehicleId} vehicle={vehicle} records={records} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* Three spans. Twelve stays the default because it matches a year of
   ownership; three answers "is this month unusual"; all-time is for deciding
   whether to keep the car. */
const RANGES = [
  { id: '3', label: '3 months', months: 3 },
  { id: '12', label: '12 months', months: 12 },
  { id: 'all', label: 'All time', months: null },
];

/** Every vehicle, plus the "all of them" option that stays the default. */
const ALL_VEHICLES = 'all';

/**
 * Which vehicles a panel is counting.
 *
 * Was a static chip reading "All vehicles" on both panels — it answered the
 * question but did not let you ask a different one. Both panels now share a
 * single selection, because two pickers side by side that can disagree is a
 * worse answer than one that cannot: a reader comparing "Spending" against
 * "Where it went" is entitled to assume they are about the same vehicle.
 *
 * With one vehicle it stays a chip. A dropdown whose only option is the
 * current one is something to read and dismiss on every visit.
 */
function ScopePicker({ vehicles, value, onChange, id, label }) {
  if (vehicles.length < 2) {
    return <span className="garage-panel__scope">All vehicles</span>;
  }

  return (
    <>
      <label className="ink-sr-only" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="garage-panel__scope garage-panel__scope--picker"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value={ALL_VEHICLES}>All vehicles</option>
        {vehicles.map((vehicle) => (
          <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
            {displayVehicleName(vehicle)}
          </option>
        ))}
      </select>
    </>
  );
}

/** The records one scope selection covers, and what to call it. */
function useScopedRecords(records, vehicles, scopeId) {
  /* A vehicle deleted while selected would otherwise leave a panel filtering
     on an id that no longer exists, reporting zero as though it were a fact
     about the garage. */
  const vehicle = vehicles.find((entry) => entry.vehicleId === scopeId) ?? null;
  const activeId = vehicle ? scopeId : ALL_VEHICLES;

  const scoped = useMemo(
    () => (activeId === ALL_VEHICLES
      ? records
      : records.filter((record) => record.vehicleId === activeId)),
    [records, activeId],
  );

  return { scoped, activeId, scopeLabel: vehicle ? displayVehicleName(vehicle) : 'All vehicles' };
}

function SpendingPanel({ records, vehicles, scopeId, onScopeChange }) {
  const [rangeId, setRangeId] = useState('12');
  const range = RANGES.find((option) => option.id === rangeId) ?? RANGES[1];
  const { scoped, activeId, scopeLabel } = useScopedRecords(records, vehicles, scopeId);


  const series = useMemo(
    () => (range.months === null ? allTimeSeries(scoped) : monthSeries(scoped, range.months)),
    [scoped, range.months],
  );
  const peak = peakMonth(series);
  const total = seriesTotal(series);

  /* Against the same span immediately before it. Null when there is nothing
     behind the window: a first month of use has no previous period, and
     reporting "down 100%" there would be an invention. All-time has nothing
     before it by definition. */
  const previous = useMemo(
    () => (range.months === null ? null : previousPeriodTotal(scoped, range.months)),
    [scoped, range.months],
  );
  const delta = previous !== null && previous > 0
    ? Math.round(((total - previous) / previous) * 100)
    : null;

  return (
    <section className="garage-panel">
      <div className="garage-panel__head">
        <div className="garage-panel__title">
          <h2 className="ink-section-title">Spending</h2>
          {/* Which vehicles this counts. It was a static chip reading "All
              vehicles", which answered the question but did not let you ask a
              different one. Still a chip when there is only one vehicle,
              because then there is nothing to pick. */}
          <ScopePicker
            vehicles={vehicles}
            value={scopeId}
            onChange={onScopeChange}
            id="spend-vehicle"
            label="Vehicles counted in spending"
          />
        </div>
        <div className="ink-segmented garage-range" role="group" aria-label="Time range">
          {RANGES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === rangeId ? 'is-active' : undefined}
              aria-pressed={option.id === rangeId}
              onClick={() => setRangeId(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="garage-figure">
        <strong className="garage-figure__value" key={activeId}>{formatAmount(total)}</strong>
        {delta !== null && (
          /* Up is not automatically bad news. The arrow gives direction and
             the words say what it is measured against; neither claims it is a
             problem, because only the owner knows that. */
          <span className={`garage-delta garage-delta--${delta > 0 ? 'up' : 'down'}`}>
            {delta > 0
              ? <TrendingUp size={15} aria-hidden="true" />
              : <TrendingDown size={15} aria-hidden="true" />}
            {Math.abs(delta)}% vs previous {range.label.toLowerCase()}
          </span>
        )}
        {delta === null && peak?.total > 0 && (
          <span className="garage-figure__note">Peak month {formatAmount(peak.total)}</span>
        )}
      </div>

      {/* The axis cells share the bar gap, so each month label sits under its
          own bar rather than drifting across the series. Past eighteen months
          the labels stop fitting, so the range ends replace them. */}
      <div className="garage-spend-chart">
        <MonthBars
          series={series}
          highlightPeak
          interactive
          showAxis={series.length <= 18}
          showRange={series.length > 18}
          label={`Spending, ${scopeLabel.toLowerCase()}, ${range.label.toLowerCase()}, in pesos`}
        />
      </div>
    </section>
  );
}

/* The id has to be stable and unique per category. It was built from the
   percentage and the name, which collides the moment two categories share a
   figure — and at 0% several routinely do, leaving two rows pointing
   `aria-describedby` at the same element. Category names are unique by
   construction, so the name alone is the key. */
function categoryTipId(name) {
  return `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function WhereItWentPanel({ records, vehicles, scopeId, onScopeChange }) {
  const { scoped, activeId } = useScopedRecords(records, vehicles, scopeId);
  const categories = spendByCategory(scoped);

  return (
    <section className="garage-panel">
      <div className="garage-panel__title">
        <h2 className="ink-section-title">Where it went</h2>
        <ScopePicker
          vehicles={vehicles}
          value={scopeId}
          onChange={onScopeChange}
          id="breakdown-vehicle"
          label="Vehicles counted in the breakdown"
        />
      </div>
      <div className="garage-breakdown" key={activeId}>
        {categories.map((category) => (
          <div
            className="garage-breakdown__row"
            key={category.name}
            tabIndex={0}
            aria-describedby={categoryTipId(category.name)}
          >
            <div className="garage-breakdown__line">
              <span>{category.label}</span>
              <span className="garage-breakdown__amount">{formatAmount(category.total)}</span>
            </div>
            <div className="garage-breakdown__track">
              <div className="garage-breakdown__fill" style={{ width: `${category.percent}%` }} />
            </div>
            {/* On hover, not in the layout. Inline it cost four lines and
                stretched the panel; here it costs none. Focusable so it is
                reachable by keyboard and by tap, since a touch screen has no
                hover — `aria-describedby` ties it to the row it explains. */}
            <div className="garage-breakdown__pop" role="tooltip" id={categoryTipId(category.name)}>
              {category.count > 0
                ? (
                  <>
                    <strong>{pluralize(category.count, 'record')}</strong>
                    {category.examples.length > 0 && <span>{category.examples.join(', ')}</span>}
                    {category.percent > 0 && <span>{category.percent}% of all spend</span>}
                  </>
                )
                : <strong>Nothing in this category</strong>}
            </div>
          </div>
        ))}
      </div>
      <p className="garage-breakdown__foot">
        Categories are worked out from the service description, so a record can
        land in the wrong one.
      </p>
    </section>
  );
}

/* The three ways in, in the words the flow itself uses. Kept identical to
   `methods` in ServiceInputMethodPage on purpose: the owner is about to see
   that screen, or skip straight past it, and two descriptions of the same
   three choices is how they drift apart. */
const START_METHODS = [
  {
    key: 'receipt',
    icon: FileText,
    title: 'Photo of the receipt',
    body: 'We read the date, shop, services and cost off it. You correct anything before it saves.',
    recommended: true,
  },
  {
    key: 'voice',
    icon: Mic,
    title: 'Voice note',
    body: 'Say what was done and we write it down. Quickest when you have no paper.',
  },
  {
    key: 'manual',
    icon: PenLine,
    title: 'Type it in',
    body: 'Your own words, nothing guessed. Best for a service you already know.',
  },
];

/**
 * The empty garage's one panel.
 *
 * <p>It replaced a "Scan a receipt" button that did not scan a receipt: it and
 * the "Type it in" beside it both linked to `/service-input`, the screen that
 * asks which of the three methods you want. Two labels, one destination, and
 * neither promise kept. The three methods are the choice, so the panel offers
 * them directly.
 *
 * <p>With one vehicle each card goes straight into that method — the flow is
 * built to skip its vehicle step when the car is already known, and an owner
 * with one car should never be asked which. With several, the link goes to the
 * picker, which is then a question worth asking.
 */
function StartHere({ vehicles }) {
  const onlyVehicleId = vehicles.length === 1 ? vehicles[0].vehicleId : null;
  const hrefFor = (key) => (onlyVehicleId ? `/service-input/${onlyVehicleId}/${key}` : '/service-input');

  return (
    <section className="garage-start tv-reveal" style={{ '--reveal-index': 2 }}>
      <div className="garage-start__head">
        <h2 className="ink-empty__title">Add your first service record</h2>
        <p className="ink-empty__body">
          One record is enough to start. However it goes in, you see every value and correct it
          before anything is saved.
        </p>
      </div>

      <div className="garage-start__methods">
        {START_METHODS.map((method) => (
          <Link className="garage-start__method" key={method.key} to={hrefFor(method.key)}>
            <span className="garage-start__method-top">
              <method.icon size={20} aria-hidden="true" />
              {method.recommended && <span className="garage-start__rec">Recommended</span>}
            </span>
            <span className="garage-start__method-title">{method.title}</span>
            <span className="garage-start__method-body">{method.body}</span>
          </Link>
        ))}
      </div>

      {/* What the garage becomes, in the order it happens. Three lines of fact
          rather than a picture of a dashboard nobody has yet: the panels above
          stay hidden until they have something real to plot. */}
      <ol className="garage-start__next">
        <li>
          <span className="garage-start__step">Then</span>
          Your spending and service history fill the panels on this page.
        </li>
        <li>
          <span className="garage-start__step">And</span>
          A mechanic can read that history from a QR code, for as long as you allow.
        </li>
      </ol>
    </section>
  );
}

/**
 * Renders only when something actually needs action, which is why the old
 * dashboard's four separate empty states are gone — an empty panel that is
 * permanently empty teaches people to stop looking at that part of the page.
 */
function AttentionStrip({ reviewCount, requestCount, draftCount, firstDraftId }) {
  const items = [];
  /* First, because it is the only one of the three that can be lost. A record
     needing review and a waiting request both keep until they are opened; an
     unfinished draft used to have no way back to it at all. */
  if (draftCount > 0) {
    items.push(`${pluralize(draftCount, 'service record')} you started but have not finished`);
  }
  if (reviewCount > 0) items.push(`${pluralize(reviewCount, 'record')} still need${reviewCount === 1 ? 's' : ''} review`);
  if (requestCount > 0) items.push(`${pluralize(requestCount, 'mechanic access request')} waiting for your approval`);
  if (!items.length) return null;

  const total = (draftCount > 0 ? 1 : 0) + (reviewCount > 0 ? 1 : 0) + (requestCount > 0 ? 1 : 0);
  /* Straight back into the draft rather than to a list of one. */
  const target = draftCount > 0
    ? `/service-drafts/${firstDraftId}`
    : reviewCount > 0 ? '/records' : '/access/requests';

  return (
    <section className="garage-attention tv-reveal">
      <div className="garage-attention__copy">
        <span className="garage-attention__count">
          {total === 1 ? '1 thing needs you' : `${total} things need you`}
        </span>
        {items.map((item) => <p className="garage-attention__item" key={item}>{item}</p>)}
      </div>
      <Link className="ink-button ink-button--outline garage-attention__action" to={target}>
        {draftCount > 0 ? 'Finish it' : total > 1 ? 'Review both' : 'Review'}
      </Link>
    </section>
  );
}

export default function GaragePage() {
  const { garages, allRecords, reviewCount, loading, error } = useGarage();
  const [requestCount, setRequestCount] = useState(0);
  const [drafts, setDrafts] = useState([]);
  /* One selection for both panels. Held here rather than in either of
     them so they cannot drift apart. */
  const [scopeId, setScopeId] = useState(ALL_VEHICLES);
  const vehicles = useMemo(() => garages.map((entry) => entry.vehicle), [garages]);
  const currentUser = getActiveCurrentUser();
  const firstName = getUserDisplayName(currentUser).split(' ')[0] || 'there';

  useEffect(() => {
    let active = true;
    getPendingMechanicAccessRequests()
      .then((data) => { if (active) setRequestCount(data.length); })
      .catch(() => { if (active) setRequestCount(0); });
    return () => { active = false; };
  }, []);

  /* Drafts the owner started and left. Failing quietly to none is right here:
     the strip is a prompt, and a prompt that cannot load is better absent than
     wrong. The drafts are still reachable from their own screen. */
  useEffect(() => {
    let active = true;
    listServiceDrafts()
      .then((data) => { if (active) setDrafts(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setDrafts([]); });
    return () => { active = false; };
  }, []);

  const lastServiceRelative = useMemo(() => relativeDays(allRecords[0]?.serviceDate), [allRecords]);
  const summary = [
    pluralize(garages.length, 'vehicle'),
    pluralize(allRecords.length, 'record'),
    lastServiceRelative ? `last service ${lastServiceRelative}` : 'no service recorded yet',
  ].join(' · ');

  const recentRecords = allRecords.slice(0, 5);
  const hasVehicles = garages.length > 0;
  const hasRecords = allRecords.length > 0;

  return (
    <main className="ink-page garage-page">
      <header className="ink-page__header">
        <div>
          <h1 className="ink-page__title">{greetingFor(new Date().getHours())}, {firstName}</h1>
          <p className="ink-page__summary">{loading ? 'Loading your garage…' : summary}</p>
        </div>
        <Link className="ink-button" to="/service-input">Add service record</Link>
      </header>

      {error && <div className="ink-alert">{error}</div>}

      {/* Everything below arrives rather than appearing. The data lands in one
          frame after a wait on the network, and painting it all at once reads
          as a jolt; a step of 60ms between blocks reads as the page settling.
          See styles/reveal.css. */}
      {!loading && hasVehicles && (
        <AttentionStrip
          reviewCount={reviewCount}
          requestCount={requestCount}
          draftCount={drafts.length}
          firstDraftId={drafts[0]?.draftId}
        />
      )}

      {!loading && !hasVehicles && (
        <section className="ink-empty tv-reveal">
          <h2 className="ink-empty__title">Add your first vehicle</h2>
          <p className="ink-empty__body">
            Everything in Trevora hangs off a vehicle &mdash; its records, its history and what you
            share with a mechanic. Start with the car you drive most.
          </p>
          <div className="ink-empty__actions">
            <Link className="ink-button" to="/vehicles/new">Add a vehicle</Link>
          </div>
        </section>
      )}

      {hasVehicles && <VehicleCarousel garages={garages} />}

      {hasVehicles && !hasRecords && !loading && <StartHere vehicles={vehicles} />}

      {hasRecords && (
        <>
          <div className="garage-panels tv-reveal" style={{ '--reveal-index': 2 }}>
            <SpendingPanel
              records={allRecords}
              vehicles={vehicles}
              scopeId={scopeId}
              onScopeChange={setScopeId}
            />
            <WhereItWentPanel
              records={allRecords}
              vehicles={vehicles}
              scopeId={scopeId}
              onScopeChange={setScopeId}
            />
          </div>

          {/* The table holds the reveal, not its rows: the rows re-render
              whenever the data changes and would re-run the animation each
              time. */}
          <section className="ink-table-card tv-reveal" style={{ '--reveal-index': 3 }}>
            <div className="ink-table-card__head">
              <h2 className="ink-section-title">Latest across all vehicles</h2>
              <Link className="ink-table-card__link" to="/records">View all {allRecords.length}</Link>
            </div>
            <RecordsTable records={recentRecords} ariaLabel="Latest service records across all vehicles" />
          </section>
        </>
      )}
    </main>
  );
}
