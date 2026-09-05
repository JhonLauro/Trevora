import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ConfirmDialog, { useDeleteAction } from '../components/ink/ConfirmDialog.jsx';
import EditVehicleDetailsDialog from '../components/ink/EditVehicleDetailsDialog.jsx';
import PartsView from '../components/ink/PartsView.jsx';
import RecordsTable from '../components/ink/RecordsTable.jsx';
import Tabs from '../components/ink/Tabs.jsx';
import Timeline from '../components/ink/Timeline.jsx';
import { deleteVehicle, getVehicle, updateVehicle } from '../api/vehicles';
import { createVehiclePhotoSignedUrl } from '../api/vehiclePhoto.js';
import { deleteVehicleServiceRecord, getVehicleServiceHistory, markServiceRecordReviewed } from '../api/serviceHistory';
import { componentStatuses } from '../utils/componentStatus';
import { historyCompleteness, listYears } from '../utils/completeness';
import { formatAmount, formatDate, formatOdometer, pluralize } from '../utils/format';
import { needsReview } from '../utils/recordStatus';
import ConcernsPanel from '../components/ConcernsPanel';
import { openConcernCount } from '../utils/concerns';
import {
  createConcern,
  deleteConcern,
  getConcerns,
  setConcernResolved,
  updateConcern,
} from '../api/concerns';
import { recordSearchText } from '../utils/serviceComponents';
import { serviceItemsSummaryLabel } from '../utils/serviceText';
import { spendTotals } from '../utils/spend';
import { displayVehicleName } from '../utils/vehicleText';
import { bodyTypeLabel, vehicleClassFor } from '../data/vehicleCatalog';

/* Components leads because it is the only view that says something before the
   first record exists: every part of the vehicle, most of them still empty.
   Timeline opening on "no records yet" taught a new owner nothing. */
const VIEWS = [
  { id: 'components', labelKey: 'vehicle.components' },
  { id: 'timeline', labelKey: 'vehicle.timeline' },
  { id: 'table', labelKey: 'vehicle.table' },
];

/** Values past roughly nine characters drop a step rather than overflow. */
function statClass(value) {
  return `vehicle-stat__value${String(value).length > 9 ? ' vehicle-stat__value--long' : ''}`;
}

function Stat({ label, value, note = null }) {
  return (
    <div className="vehicle-stat">
      <span className="ink-eyebrow">{label}</span>
      <span className={statClass(value)}>{value}</span>
      {/* Rendered only when there is something to say. An always-present
          "PHP 0 covered" is noise for the many owners who never claim. */}
      {note && <span className="vehicle-stat__note">{note}</span>}
    </div>
  );
}

/**
 * One registration field, drawn whether or not it has been filled in.
 *
 * An empty field still gets its label and a stated "Not recorded" — once any
 * of the four is filled, the blanks beside it are information. What this does
 * not carry is an explanation of why the field is worth filling in: that is
 * decision-support, the decision is made in the edit dialog, and the copy now
 * lives there. A card that displays four values should display four values.
 *
 * The all-blank case never reaches here; see `hasVehicleDetails`.
 */
function Detail({ label, value }) {
  const t = useT();
  const recorded = value !== null && value !== undefined && String(value).trim() !== '';
  return (
    <div className="vehicle-detail">
      <dt className="ink-eyebrow">{label}</dt>
      <dd className={`vehicle-detail__value${recorded ? '' : ' is-empty'}`}>
        {recorded ? value : t('vehicle.notRecorded')}
      </dd>
    </div>
  );
}

/**
 * Whether any of the four has been filled in.
 *
 * Four columns all reading "Not recorded" is a grid restating one fact four
 * times, and it is the state every new vehicle starts in. Below this the card
 * says it once instead.
 *
 * `!= null` rather than a truthiness check: an odometer of 0 is a reading
 * somebody took, not an absent one.
 */
function hasVehicleDetails(vehicle) {
  return Boolean(
    (vehicle?.plateNumber || '').trim()
    || (vehicle?.vinChassisNumber || '').trim()
    || vehicle?.year != null
    || vehicle?.odometer != null,
  );
}

/**
 * The one thing on this page that motivates uploading old receipts, so it
 * gets real estate. The dashed empty blocks are what make a gap look like
 * something missing rather than something small.
 */
function Completeness({ summary }) {
  const t = useT();
  if (!summary) return null;

  const { years, documentedCount, totalYears, missing, startYear } = summary;

  return (
    <section className="ink-card vehicle-completeness">
      <div className="vehicle-completeness__main">
        <div className="vehicle-completeness__head">
          <h2 className="ink-section-title">{t('vehicle.completeness')}</h2>
          {/* Not "Ownership from" — there is no ownership-start field, and
              inventing a purchase date would fake the very number this
              strip exists to be honest about. */}
          <span className="vehicle-completeness__since">Records from {startYear}</span>
        </div>
        <ul className="vehicle-years">
          {years.map((entry) => (
            <li key={entry.year}>
              <span className={`vehicle-years__block${entry.documented ? '' : ' is-empty'}`} aria-hidden="true" />
              <span className={`vehicle-years__label ink-mono${entry.documented ? '' : ' is-empty'}`}>
                {String(entry.year).slice(2)}
              </span>
            </li>
          ))}
        </ul>
        <p className="ink-sr-only">
          {documentedCount} of {totalYears} years have at least one service record.
          {missing.length > 0 && ` Nothing recorded for ${listYears(missing)}.`}
        </p>
      </div>

      <div className="vehicle-completeness__score">
        <strong>{documentedCount} of {pluralize(totalYears, 'year')}</strong>
        <p>
          {missing.length === 0
            ? 'Every year since the first record has something in it. That is the history a buyer can actually check.'
            : `Nothing recorded for ${listYears(missing)}. Gaps are what a buyer discounts for — old receipts fill them.`}
        </p>
      </div>
    </section>
  );
}

function WarrantyPanel({ spend }) {
  return (
    <section className="ink-empty">
      <h2 className="ink-empty__title">Policies are not tracked yet</h2>
      <p className="ink-empty__body">
        {spend?.hasCoverage
          ? `Individual records already record what was covered — PHP ${formatAmount(spend.covered)} so far on this vehicle. What is still missing is the policies themselves: insurer, cover, premium, and when each one lapses.`
          : 'What a policy paid can be recorded on each service record, in the review step. What is still missing is the policies themselves: insurer, cover, premium, and when each one lapses.'}
      </p>
      <p className="ink-empty__body">
        None of that is stored yet, so nothing is shown rather than showing a form that saves to
        this browser only.
      </p>
    </section>
  );
}

export default function VehiclePage() {
  const t = useT();
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  /* The bucket is private, so what the header renders is a signed URL rather
     than a stored one. Null covers both "no photo" and "the URL could not be
     signed" -- the header falls back to the placeholder either way, because a
     picture failing to load is not a reason to shout over a car's history. */
  const [photoUrl, setPhotoUrl] = useState(null);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('records');
  /* The view lives in the URL rather than in state, so it is somewhere that
     can be linked to. It was local state, which meant every route into this
     page landed on `components` -- including the Garage's "Review" button,
     whose whole job is to reach the timeline. `replace` because switching tab
     is not a navigation: it should not stack Back entries between them.

     `components` stays the default for a bare visit. That was a deliberate
     choice (see VIEWS above) and this does not disturb it. */
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const view = VIEWS.some((option) => option.id === requestedView) ? requestedView : 'components';

  /* Arriving with `?view=` means somebody was sent here to do something --
     today that is the Garage's "Review" button, aimed at the timeline. The
     records block sits below the identity header, the completeness strip and
     the stat row, so landing at the top of the page still left them scrolling
     to find it. This carries them the rest of the way.

     Only on arrival, and only once. Scrolling again when they switch tabs
     themselves would move the page under someone already looking at it. */
  const recordsRef = useRef(null);
  const arrivedAtView = useRef(Boolean(requestedView));

  useEffect(() => {
    if (!arrivedAtView.current) return;
    // The block renders once the records land; scrolling before that scrolls
    // to where a loading skeleton happened to be.
    if (loading || !recordsRef.current) return;

    arrivedAtView.current = false;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    /* After the arrival animation, not during it. The block slides up on
       `tv-reveal`, and a smooth scroll aims at wherever the target is when it
       is called -- so scrolling mid-reveal stops short of where the block
       settles. The tips guide learned the same thing the harder way. */
    const timer = window.setTimeout(() => {
      recordsRef.current?.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start',
      });
    }, reduced ? 0 : 420);

    return () => window.clearTimeout(timer);
  }, [loading]);

  function setView(next) {
    const params = new URLSearchParams(searchParams);
    if (next === 'components') {
      params.delete('view');
    } else {
      params.set('view', next);
    }
    setSearchParams(params, { replace: true });
  }
  const [query, setQuery] = useState('');
  const [pendingRecord, setPendingRecord] = useState(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [concerns, setConcerns] = useState([]);

  /* Re-signed whenever the pointer changes, which covers the first load and a
     photo added, replaced or removed from the edit dialog. The URL is good for
     an hour; nobody sits on this page that long, and a reload re-signs. */
  useEffect(() => {
    let active = true;
    if (!vehicle?.photoPath) {
      setPhotoUrl(null);
      return undefined;
    }
    createVehiclePhotoSignedUrl(vehicle).then((url) => {
      if (active) setPhotoUrl(url);
    });
    return () => { active = false; };
  }, [vehicle?.photoBucket, vehicle?.photoPath]);

  /* The response is the saved row, so it becomes the new state directly rather
     than re-fetching. The Garage listens for this event to pick up a changed
     plate without a reload. */
  async function saveVehicleDetails(payload) {
    const updated = await updateVehicle(vehicleId, payload);
    setVehicle(updated);
    setEditingDetails(false);
    window.dispatchEvent(new Event('trevora:vehicles-changed'));
  }

  const vehicleDelete = useDeleteAction(
    () => deleteVehicle(vehicleId),
    () => {
      window.dispatchEvent(new Event('trevora:vehicles-changed'));
      navigate('/', { replace: true });
    },
  );

  const recordDelete = useDeleteAction(
    () => deleteVehicleServiceRecord(vehicleId, pendingRecord.recordId),
    () => {
      setRecords((current) => current.filter((r) => r.recordId !== pendingRecord.recordId));
      setPendingRecord(null);
    },
  );

  /* Optimistic: the request either succeeds or the reload on the next visit
     puts the badge back. A spinner on a badge is more disruption than the
     rare failure costs. */
  async function markReviewed(record) {
    setRecords((current) => current.map((r) => (
      r.recordId === record.recordId ? { ...r, validationStatus: 'VALIDATED' } : r
    )));
    try {
      await markServiceRecordReviewed(vehicleId, record.recordId);
    } catch (err) {
      setError(err.message);
      setRecords((current) => current.map((r) => (
        r.recordId === record.recordId ? { ...r, validationStatus: record.validationStatus ?? null } : r
      )));
    }
  }

  function askDeleteRecord(record) {
    setPendingRecord(record);
    recordDelete.ask();
  }

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      getVehicle(vehicleId),
      getVehicleServiceHistory(vehicleId, { sort: 'newest' }),
      /* Fetched with the rest rather than when the tab opens: the count sits in
         the tab badge and the stat strip, both of which are on screen before
         anyone clicks. Failing softly because a concern list that will not load
         should not blank a page whose subject is the service history. */
      getConcerns(vehicleId).catch(() => []),
    ])
      .then(([vehicleData, history, concernList]) => {
        if (!active) return;
        setVehicle(vehicleData);
        setRecords(history.records ?? []);
        setConcerns(concernList ?? []);
        setError('');
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [vehicleId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) => [
      serviceItemsSummaryLabel(record.services),
      recordSearchText(record),
    ].join(' ').toLowerCase().includes(needle));
  }, [records, query]);

  const components = useMemo(() => componentStatuses(records, vehicle), [records, vehicle]);
  const completeness = useMemo(() => historyCompleteness(records, vehicle), [records, vehicle]);

  const reviewCount = records.filter(needsReview).length;
  /* Open only, on both the tab badge and the stat. A resolved concern is
     history, not something waiting on the owner, and counting it would make the
     number go up when they dealt with something. */
  const openCount = openConcernCount(concerns);
  // "Total spent" means what the owner actually paid. Anything insurance or a
  // warranty absorbed is shown underneath rather than folded in silently —
  // a spend figure that quietly includes money someone else paid is wrong,
  // and one that quietly excludes it without saying so is worse.
  const spend = useMemo(() => spendTotals(records), [records]);
  const name = vehicle ? displayVehicleName(vehicle) : 'Vehicle';
  // Without a nickname the title already is "2018 Toyota Vios", so repeating
  // the model underneath it says the same thing twice.
  const model = vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') : '';
  const modelLine = vehicle
    ? [vehicle.plateNumber, model === name ? null : model, bodyTypeLabel(vehicle.bodyType)]
      .filter(Boolean).join(' · ')
    : '';

  const tabs = [
    { id: 'records', label: t('vehicle.allRecords'), count: records.length },
    { id: 'concerns', label: t('vehicle.concerns'), count: openCount },
    { id: 'warranty', label: t('vehicle.warranty') },
  ];

  if (loading) {
    return (
      <main className="ink-page">
        <p className="ink-page__summary">Loading this vehicle…</p>
      </main>
    );
  }

  return (
    <main className="ink-page vehicle-page">
      <nav className="vehicle-crumbs" aria-label="Breadcrumb">
        <Link to="/">Garage</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{name}</span>
      </nav>

      {error && <div className="ink-alert">{error}</div>}

      {/* The page returns a loading line until the vehicle and its records
          are both in hand, so everything below mounts in one frame. The
          stagger is what stops that frame reading as a jolt. */}
      <header className="vehicle-identity tv-reveal">
        {/* The placeholder holds exactly the space the photo takes, so a
            vehicle with a picture and one without lay out identically. */}
        <div className={`vehicle-identity__photo${photoUrl ? ' has-photo' : ''}`}>
          {photoUrl
            ? <img src={photoUrl} alt={`Photo of ${name}`} />
            : <span aria-hidden="true">{t('vehicle.noPhoto')}</span>}
        </div>
        <div className="vehicle-identity__copy">
          <h1 className="ink-page__title">{name}</h1>
          <p className="ink-page__summary">{modelLine}</p>
          <div className="vehicle-identity__badges">
            {reviewCount > 0 ? (
              <span className="ink-badge ink-badge--warn">{pluralize(reviewCount, 'record')} need{reviewCount === 1 ? 's' : ''} review</span>
            ) : records.length > 0 ? (
              <span className="ink-badge ink-badge--ok">{t('garage.allValidated')}</span>
            ) : (
              <span className="ink-badge ink-badge--none">{t('garage.noRecordsYet')}</span>
            )}
          </div>
        </div>
        <div className="vehicle-identity__actions">
          <button
            className="ink-button ink-button--outline ink-button--quiet"
            type="button"
            onClick={vehicleDelete.ask}
          >
            {t('vehicle.deleteVehicle')}
          </button>
          <Link className="ink-button ink-button--outline" to={`/vehicles/${vehicleId}/share`}>{t('vehicle.shareHistory')}</Link>
          <Link className="ink-button" to={`/service-input/${vehicleId}`}>{t('garage.addRecordShort')}</Link>
        </div>
      </header>

      {/* The four details a buyer, an insurer or a mechanic asks for by name,
          and the four the Add form lets you skip — so this is both where they
          are read and the only place they can be supplied afterwards.

          It displays values and nothing else. Why each one is worth filling in
          is a decision, the decision is taken in the dialog, and the reasoning
          now sits next to the inputs it applies to. Nothing here requires
          them: records join to a vehicle by vehicle_id, and a record saves on
          vehicle, date, service and cost alone. */}
      <section className="ink-card vehicle-details tv-reveal" style={{ '--reveal-index': 1 }}>
        <div className="vehicle-details__head">
          <h2 className="vehicle-details__title">{t('vehicle.details')}</h2>
          <button
            className="ink-button ink-button--outline ink-button--sm"
            type="button"
            disabled={!vehicle}
            onClick={() => setEditingDetails(true)}
          >
            {t('vehicle.editDetails')}
          </button>
        </div>
        {hasVehicleDetails(vehicle) ? (
          <dl className="vehicle-details__grid">
            <Detail label={t('vehicle.plateNumber')} value={vehicle?.plateNumber} />
            <Detail label={t('vehicle.vin')} value={vehicle?.vinChassisNumber} />
            <Detail label={t('vehicle.modelYear')} value={vehicle?.year} />
            <Detail label={t('vehicle.odometer')} value={vehicle?.odometer == null ? null : formatOdometer(vehicle.odometer)} />
          </dl>
        ) : (
          /* Said once, plainly, with the button beside it as the way in. No
             badge, no count, no meter — a blank here is a valid answer, and
             the sentence is an offer rather than an outstanding task. */
          <p className="vehicle-details__empty">
            No plate, VIN, model year, or odometer recorded yet. Optional — these help confirm the
            right vehicle when you share this history.
          </p>
        )}
      </section>

      <Completeness summary={completeness} />

      <section className="ink-card vehicle-stats tv-reveal" style={{ '--reveal-index': 2 }}>
        <Stat label="Records" value={String(records.length)} />
        <Stat label={t('garage.lastService')} value={records[0]?.serviceDate ? formatDate(records[0].serviceDate) : t('garage.noneYet')} />
        <Stat label={t('vehicle.odometer')} value={formatOdometer(vehicle?.odometer, t('vehicle.notRecorded'))} />
        <Stat
          label={t('vehicle.totalSpent')}
          value={`PHP ${formatAmount(spend.ownerPaid)}`}
          note={spend.hasCoverage ? `PHP ${formatAmount(spend.covered)} covered` : null}
        />
        <Stat label={t('vehicle.needsReview')} value={String(reviewCount)} />
        <Stat label={t('vehicle.openConcerns')} value={String(openCount)} />
      </section>

      <Tabs tabs={tabs} activeId={tab} onChange={setTab} label={t('vehicle.sections')} />

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}>
        {tab === 'records' && (
          <div className="vehicle-records tv-reveal" ref={recordsRef} style={{ '--reveal-index': 3 }}>
            <div className="vehicle-toolbar">
              {/* Components filters by part, not by text — the box would sit
                  there doing nothing, and it is the first control on the page
                  now that Components leads. */}
              {view === 'components' ? <span /> : (
                <input
                  type="search"
                  value={query}
                  aria-label={t('vehicle.searchRecords')}
                  placeholder={t('records.searchPlaceholder')}
                  onChange={(event) => setQuery(event.target.value)}
                />
              )}
              <div className="ink-segmented" role="group" aria-label="View">
                {VIEWS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={view === option.id}
                    className={view === option.id ? 'is-active' : undefined}
                    onClick={() => setView(option.id)}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Components is checked before the empty state, because it is the
                one view that does not need a record to say something: the
                taxonomy is a property of the vehicle, so a brand-new
                motorcycle still lists its twelve parts, all of them "no
                record found". That list is the thing that shows an owner what
                there is to fill in. */}
            {view === 'components' ? (
              <>
                {records.length === 0 && (
                  <p className="parts-panel__note">
                    Nothing has been filed against this vehicle yet, so every part below reads as
                    no record found. Adding a receipt fills in the parts it covers.
                  </p>
                )}
                <PartsView
                  entries={components}
                  vehicleId={vehicleId}
                  vehicleClass={vehicleClassFor(vehicle?.bodyType)}
                  bodyType={vehicle?.bodyType ?? null}
                />
              </>
            ) : records.length === 0 ? (
              <section className="ink-empty">
                <h2 className="ink-empty__title">{t('vehicle.noRecordsHere')}</h2>
                <p className="ink-empty__body">
                  One receipt is enough to begin. Everything on this page — the year strip, the
                  component list, the totals — is worked out from the records you add.
                </p>
                <div className="ink-empty__actions">
                  <Link className="ink-button" to={`/service-input/${vehicleId}`}>{t('vehicle.addFirst')}</Link>
                </div>
              </section>
            ) : filtered.length === 0 ? (
              <section className="ink-empty">
                <h2 className="ink-empty__title">{t('vehicle.noMatch')}</h2>
                <p className="ink-empty__body">{t('vehicle.trySearch')}</p>
              </section>
            ) : view === 'timeline' ? (
              <Timeline
                records={filtered}
                vehicleId={vehicleId}
                onDelete={askDeleteRecord}
                onMarkReviewed={markReviewed}
              />
            ) : (
              <section className="ink-table-card">
                <RecordsTable
                  records={filtered}
                  showVehicle={false}
                  ariaLabel={`Service records for ${name}`}
                  onDelete={askDeleteRecord}
                />
              </section>
            )}
          </div>
        )}

        {tab === 'concerns' && (
          <div className="vehicle-concerns tv-reveal" style={{ '--reveal-index': 3 }}>
            <ConcernsPanel
              concerns={concerns}
              onAdd={async (note) => setConcerns([await createConcern(vehicleId, note), ...concerns])}
              onEdit={async (concernId, note) => {
                const updated = await updateConcern(vehicleId, concernId, note);
                setConcerns((current) => current.map((c) => (c.concernId === concernId ? updated : c)));
              }}
              onResolve={async (concernId, resolved) => {
                const updated = await setConcernResolved(vehicleId, concernId, resolved);
                setConcerns((current) => current.map((c) => (c.concernId === concernId ? updated : c)));
              }}
              onDelete={async (concernId) => {
                await deleteConcern(vehicleId, concernId);
                setConcerns((current) => current.filter((c) => c.concernId !== concernId));
              }}
            />
          </div>
        )}

        {tab === 'warranty' && <WarrantyPanel spend={spend} />}
      </div>

      <EditVehicleDetailsDialog
        open={editingDetails}
        vehicle={vehicle}
        photoUrl={photoUrl}
        onSave={saveVehicleDetails}
        onCancel={() => setEditingDetails(false)}
      />

      <ConfirmDialog
        open={vehicleDelete.open}
        busy={vehicleDelete.busy}
        error={vehicleDelete.error}
        title={`Delete ${name}?`}
        confirmLabel={t('vehicle.deleteVehicle')}
        onCancel={vehicleDelete.cancel}
        onConfirm={vehicleDelete.confirm}
        body={(
          <>
            {/* The count is the fact that changes minds, so it leads — but
                "deletes 0 service records" is a strange thing to warn about,
                and an empty vehicle deserves the easier sentence. */}
            {records.length > 0 ? (
              <p>
                This also deletes {pluralize(records.length, 'service record')} filed against it,
                along with any drafts and shared access.
              </p>
            ) : (
              <p>{t('vehicle.onlyVehicleGoes')}</p>
            )}
            <p>{t('vehicle.noUndo')}</p>
          </>
        )}
      />

      <ConfirmDialog
        open={recordDelete.open}
        busy={recordDelete.busy}
        error={recordDelete.error}
        title={t('records.deleteRecordAsk')}
        confirmLabel={t('records.deleteRecord')}
        onCancel={() => { recordDelete.cancel(); setPendingRecord(null); }}
        onConfirm={recordDelete.confirm}
        body={pendingRecord && (
          <>
            <p>
              <strong>{serviceItemsSummaryLabel(pendingRecord.services)}</strong>
              {pendingRecord.serviceDate && <> &mdash; {formatDate(pendingRecord.serviceDate)}</>}
            </p>
            <p>
              {t('vehicle.deleteBody')}
              {t('vehicle.noUndo')}
            </p>
          </>
        )}
      />
    </main>
  );
}
