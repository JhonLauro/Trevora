import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MonthBars from '../components/ink/MonthBars.jsx';
import RecordsTable from '../components/ink/RecordsTable.jsx';
import useGarage from '../hooks/useGarage.js';
import { getActiveCurrentUser, getUserDisplayName } from '../api/currentUser.js';
import { getPendingMechanicAccessRequests } from '../api/qrAccess.js';
import { formatAmount, formatMonthYear, pluralize, relativeDays } from '../utils/format';
import { lastTwelveMonths, peakMonth } from '../utils/monthlySeries';
import { needsReview } from '../utils/recordStatus';
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

      <div className="garage-card__chart">
        <MonthBars
          series={series}
          showRange
          label={`Service activity for ${name} over the last 12 months`}
        />
      </div>

      <div className="garage-card__actions">
        <Link className="ink-button ink-button--sm" to={`/service-input/${vehicleId}`}>Add record</Link>
        <Link className="ink-button ink-button--outline ink-button--sm" to={`/vehicles/${vehicleId}`}>Open vehicle</Link>
      </div>
    </article>
  );
}

/**
 * Vehicle carousel.
 *
 * The third card is deliberately clipped at the frame edge — that sliver says
 * "there is more" better than the counter does. Arrows are always present
 * because this audience does not reliably discover swipe; swipe, arrow keys
 * and dots are all additions on top of them, never replacements.
 */
function VehicleCarousel({ garages }) {
  const [page, setPage] = useState(0);
  const [metrics, setMetrics] = useState({ perPage: 1, cardWidth: 0 });
  const trackRef = useRef(null);
  const touchStart = useRef(null);

  const { perPage, cardWidth } = metrics;
  const pageCount = Math.max(1, Math.ceil(garages.length / perPage));

  // Measured rather than assumed, so the page step stays correct at any width
  // — including the sizes between the two the design specifies.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    function measure() {
      const trackWidth = track.clientWidth;
      const card = track.querySelector('.garage-card');
      const width = card?.getBoundingClientRect().width ?? 0;
      if (!trackWidth || !width) return;
      setMetrics({
        perPage: Math.max(1, Math.floor((trackWidth + CARD_GAP) / (width + CARD_GAP))),
        cardWidth: width,
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [garages.length]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const single = garages.length === 1;
  const first = page * perPage + 1;
  const last = Math.min((page + 1) * perPage, garages.length);
  const offset = page * perPage * (cardWidth + CARD_GAP);

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPage((current) => Math.max(0, current - 1));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPage((current) => Math.min(pageCount - 1, current + 1));
    }
  }

  function handleTouchEnd(event) {
    const start = touchStart.current;
    if (start === null) return;
    const delta = start - event.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) {
      setPage((current) => Math.min(pageCount - 1, Math.max(0, current + Math.sign(delta))));
    }
    touchStart.current = null;
  }

  return (
    <section className={`garage-carousel${single ? ' garage-carousel--single' : ''}`}>
      <div className="garage-carousel__head">
        <h2 className="ink-section-title">Your vehicles</h2>
        <div className="garage-carousel__controls">
          <Link className="ink-button ink-button--outline garage-carousel__add" to="/vehicles/new">
            Add vehicle
          </Link>
        {!single && (
          <>
            <span className="garage-carousel__counter ink-mono">{first}&ndash;{last} of {garages.length}</span>
            <button
              className="garage-carousel__arrow"
              type="button"
              aria-label="Previous vehicles"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              className="garage-carousel__arrow"
              type="button"
              aria-label="Next vehicles"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
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
        aria-label={single ? undefined : 'Vehicles, use the left and right arrow keys'}
        onKeyDown={single ? undefined : handleKeyDown}
        onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }}
        onTouchEnd={handleTouchEnd}
      >
        <div className="garage-track__row" style={{ transform: `translateX(-${offset}px)` }}>
          {garages.map(({ vehicle, records }) => (
            <VehicleCard key={vehicle.vehicleId} vehicle={vehicle} records={records} />
          ))}
        </div>
      </div>

      {!single && (
        <>
          <div className="garage-dots">
            {Array.from({ length: pageCount }, (unused, index) => (
              <button
                key={index}
                type="button"
                className={index === page ? 'is-active' : undefined}
                aria-label={`Go to vehicle ${index * perPage + 1}`}
                aria-current={index === page}
                onClick={() => setPage(index)}
              />
            ))}
          </div>
          <p className="ink-sr-only" aria-live="polite">
            {`Showing vehicle ${first} of ${garages.length}`}
          </p>
        </>
      )}
    </section>
  );
}

function SpendingPanel({ records }) {
  const series = lastTwelveMonths(records);
  const peak = peakMonth(series);

  return (
    <section className="garage-panel">
      <div className="garage-panel__head">
        <h2 className="ink-section-title">Spending, last 12 months</h2>
        {peak?.total > 0 && <span className="ink-mono">Peak {formatAmount(peak.total)}</span>}
      </div>
      {/* The axis cells share the bar gap, so each month label sits under
          its own bar rather than drifting across the series. */}
      <div className="garage-spend-chart">
        <MonthBars
          series={series}
          highlightPeak
          showAxis
          label="Spending across all vehicles over the last 12 months, in pesos"
        />
      </div>
    </section>
  );
}

function WhereItWentPanel({ records }) {
  const categories = spendByCategory(records);

  return (
    <section className="garage-panel">
      <h2 className="ink-section-title">Where it went</h2>
      <div className="garage-breakdown">
        {categories.map((category) => (
          <div className="garage-breakdown__row" key={category.name}>
            <div className="garage-breakdown__line">
              <span>{category.name}</span>
              <span className="garage-breakdown__amount">{formatAmount(category.total)}</span>
            </div>
            <div className="garage-breakdown__track">
              <div className="garage-breakdown__fill" style={{ width: `${category.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Renders only when something actually needs action, which is why the old
 * dashboard's four separate empty states are gone — an empty panel that is
 * permanently empty teaches people to stop looking at that part of the page.
 */
function AttentionStrip({ reviewCount, requestCount }) {
  const items = [];
  if (reviewCount > 0) items.push(`${pluralize(reviewCount, 'record')} still need${reviewCount === 1 ? 's' : ''} review`);
  if (requestCount > 0) items.push(`${pluralize(requestCount, 'mechanic access request')} waiting for your approval`);
  if (!items.length) return null;

  const total = (reviewCount > 0 ? 1 : 0) + (requestCount > 0 ? 1 : 0);
  const target = reviewCount > 0 ? '/records' : '/access/requests';

  return (
    <section className="garage-attention">
      <div className="garage-attention__copy">
        <span className="garage-attention__count">
          {total === 1 ? '1 thing needs you' : `${total} things need you`}
        </span>
        {items.map((item) => <p className="garage-attention__item" key={item}>{item}</p>)}
      </div>
      <Link className="ink-button ink-button--outline garage-attention__action" to={target}>
        {total > 1 ? 'Review both' : 'Review'}
      </Link>
    </section>
  );
}

export default function GaragePage() {
  const { garages, allRecords, reviewCount, loading, error } = useGarage();
  const [requestCount, setRequestCount] = useState(0);
  const currentUser = getActiveCurrentUser();
  const firstName = getUserDisplayName(currentUser).split(' ')[0] || 'there';

  useEffect(() => {
    let active = true;
    getPendingMechanicAccessRequests()
      .then((data) => { if (active) setRequestCount(data.length); })
      .catch(() => { if (active) setRequestCount(0); });
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
    <main className="ink-page">
      <header className="ink-page__header">
        <div>
          <h1 className="ink-page__title">{greetingFor(new Date().getHours())}, {firstName}</h1>
          <p className="ink-page__summary">{loading ? 'Loading your garage…' : summary}</p>
        </div>
        <Link className="ink-button" to="/service-input">Add service record</Link>
      </header>

      {error && <div className="ink-alert">{error}</div>}

      {!loading && hasVehicles && (
        <AttentionStrip reviewCount={reviewCount} requestCount={requestCount} />
      )}

      {!loading && !hasVehicles && (
        <section className="ink-empty">
          <h2 className="ink-empty__title">Add your first vehicle</h2>
          <p className="ink-empty__body">
            Everything in Trevora hangs off a vehicle &mdash; records, reminders and what you share
            with a mechanic. Start with the car you drive most.
          </p>
          <div className="ink-empty__actions">
            <Link className="ink-button" to="/vehicles/new">Add a vehicle</Link>
          </div>
        </section>
      )}

      {hasVehicles && <VehicleCarousel garages={garages} />}

      {hasVehicles && !hasRecords && !loading && (
        <section className="ink-empty">
          <h2 className="ink-empty__title">Start with your last receipt</h2>
          <p className="ink-empty__body">
            One receipt is enough to begin. Trevora reads the date, shop, services and cost off it,
            and you correct anything it got wrong before it is saved.
          </p>
          <div className="ink-empty__actions">
            <Link className="ink-button" to="/service-input">Upload a receipt</Link>
            <Link className="ink-button ink-button--outline" to="/service-input">Enter it manually</Link>
          </div>
        </section>
      )}

      {hasRecords && (
        <>
          <div className="garage-panels">
            <SpendingPanel records={allRecords} />
            <WhereItWentPanel records={allRecords} />
          </div>

          <section className="ink-table-card">
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
