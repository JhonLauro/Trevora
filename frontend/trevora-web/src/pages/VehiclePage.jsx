import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ConfirmDialog, { useDeleteAction } from '../components/ink/ConfirmDialog.jsx';
import PartsView from '../components/ink/PartsView.jsx';
import RecordsTable from '../components/ink/RecordsTable.jsx';
import Tabs from '../components/ink/Tabs.jsx';
import Timeline from '../components/ink/Timeline.jsx';
import { deleteVehicle, getVehicle } from '../api/vehicles';
import { deleteVehicleServiceRecord, getVehicleServiceHistory } from '../api/serviceHistory';
import { componentStatuses } from '../utils/componentStatus';
import { historyCompleteness, listYears } from '../utils/completeness';
import { formatAmount, formatDate, formatOdometer, pluralize } from '../utils/format';
import { needsReview } from '../utils/recordStatus';
import { recordSearchText } from '../utils/serviceComponents';
import { serviceItemsSummaryLabel } from '../utils/serviceText';
import { displayVehicleName } from '../utils/vehicleText';
import { bodyTypeLabel, vehicleClassFor } from '../data/vehicleCatalog';

const VIEWS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'components', label: 'Components' },
  { id: 'table', label: 'Table' },
];

/** Values past roughly nine characters drop a step rather than overflow. */
function statClass(value) {
  return `vehicle-stat__value${String(value).length > 9 ? ' vehicle-stat__value--long' : ''}`;
}

function Stat({ label, value }) {
  return (
    <div className="vehicle-stat">
      <span className="ink-eyebrow">{label}</span>
      <span className={statClass(value)}>{value}</span>
    </div>
  );
}

/**
 * The one thing on this page that motivates uploading old receipts, so it
 * gets real estate. The dashed empty blocks are what make a gap look like
 * something missing rather than something small.
 */
function Completeness({ summary }) {
  if (!summary) return null;

  const { years, documentedCount, totalYears, missing, startYear } = summary;

  return (
    <section className="ink-card vehicle-completeness">
      <div className="vehicle-completeness__main">
        <div className="vehicle-completeness__head">
          <h2 className="ink-section-title">History completeness</h2>
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

function WarrantyPanel() {
  return (
    <section className="ink-empty">
      <h2 className="ink-empty__title">Coverage is not tracked yet</h2>
      <p className="ink-empty__body">
        Insurance, extended warranty, registration and shop warranty all belong here, with what
        is still in force and when it lapses. None of it is stored yet, so nothing is shown
        rather than showing a form that saves to this browser only.
      </p>
    </section>
  );
}

export default function VehiclePage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('records');
  const [view, setView] = useState('timeline');
  const [query, setQuery] = useState('');
  const [pendingRecord, setPendingRecord] = useState(null);

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
    ])
      .then(([vehicleData, history]) => {
        if (!active) return;
        setVehicle(vehicleData);
        setRecords(history.records ?? []);
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
  const totalSpend = records.reduce((sum, record) => sum + Number(record.totalCost || 0), 0);
  const name = vehicle ? displayVehicleName(vehicle) : 'Vehicle';
  // Without a nickname the title already is "2018 Toyota Vios", so repeating
  // the model underneath it says the same thing twice.
  const model = vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') : '';
  const modelLine = vehicle
    ? [vehicle.plateNumber, model === name ? null : model, bodyTypeLabel(vehicle.bodyType)]
      .filter(Boolean).join(' · ')
    : '';

  const tabs = [
    { id: 'records', label: 'All records', count: records.length },
    { id: 'warranty', label: 'Warranty & coverage' },
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

      <header className="vehicle-identity">
        {/* Owner-supplied photos are not stored yet, so this is always the
            placeholder. It holds the space the photo will take rather than
            letting the header reflow when photos arrive. */}
        <div className="vehicle-identity__photo" aria-hidden="true">
          <span>No photo</span>
        </div>
        <div className="vehicle-identity__copy">
          <h1 className="ink-page__title">{name}</h1>
          <p className="ink-page__summary">{modelLine}</p>
          <div className="vehicle-identity__badges">
            {reviewCount > 0 ? (
              <span className="ink-badge ink-badge--warn">{pluralize(reviewCount, 'record')} need{reviewCount === 1 ? 's' : ''} review</span>
            ) : records.length > 0 ? (
              <span className="ink-badge ink-badge--ok">All validated</span>
            ) : (
              <span className="ink-badge ink-badge--none">No records yet</span>
            )}
          </div>
        </div>
        <div className="vehicle-identity__actions">
          <button
            className="ink-button ink-button--outline ink-button--quiet"
            type="button"
            onClick={vehicleDelete.ask}
          >
            Delete vehicle
          </button>
          <Link className="ink-button ink-button--outline" to={`/vehicles/${vehicleId}/share`}>Share history</Link>
          <Link className="ink-button" to={`/service-input/${vehicleId}`}>Add record</Link>
        </div>
      </header>

      <Completeness summary={completeness} />

      <section className="ink-card vehicle-stats">
        <Stat label="Records" value={String(records.length)} />
        <Stat label="Last service" value={records[0]?.serviceDate ? formatDate(records[0].serviceDate) : 'None yet'} />
        <Stat label="Odometer" value={formatOdometer(vehicle?.odometer, 'Not recorded')} />
        <Stat label="Total spent" value={`PHP ${formatAmount(totalSpend)}`} />
        <Stat label="Needs review" value={String(reviewCount)} />
      </section>

      <Tabs tabs={tabs} activeId={tab} onChange={setTab} label="Vehicle sections" />

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}>
        {tab === 'records' && (
          <div className="vehicle-records">
            <div className="vehicle-toolbar">
              <input
                type="search"
                value={query}
                aria-label="Search this vehicle's records"
                placeholder="Search service, part, shop, or notes"
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="ink-segmented" role="group" aria-label="View">
                {VIEWS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={view === option.id}
                    className={view === option.id ? 'is-active' : undefined}
                    onClick={() => setView(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {records.length === 0 ? (
              <section className="ink-empty">
                <h2 className="ink-empty__title">No records for this vehicle yet</h2>
                <p className="ink-empty__body">
                  One receipt is enough to begin. Everything on this page — the year strip, the
                  component list, the totals — is worked out from the records you add.
                </p>
                <div className="ink-empty__actions">
                  <Link className="ink-button" to={`/service-input/${vehicleId}`}>Add the first record</Link>
                </div>
              </section>
            ) : filtered.length === 0 ? (
              <section className="ink-empty">
                <h2 className="ink-empty__title">Nothing matches that search</h2>
                <p className="ink-empty__body">Try a shop name, a part, or the kind of service.</p>
              </section>
            ) : view === 'timeline' ? (
              <Timeline records={filtered} vehicleId={vehicleId} onDelete={askDeleteRecord} />
            ) : view === 'components' ? (
              <PartsView entries={components} vehicleId={vehicleId} vehicleClass={vehicleClassFor(vehicle?.bodyType)} />
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

        {tab === 'warranty' && <WarrantyPanel />}
      </div>

      <ConfirmDialog
        open={vehicleDelete.open}
        busy={vehicleDelete.busy}
        error={vehicleDelete.error}
        title={`Delete ${name}?`}
        confirmLabel="Delete vehicle"
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
              <p>Nothing has been filed against it yet, so only the vehicle goes.</p>
            )}
            <p>There is no undo.</p>
          </>
        )}
      />

      <ConfirmDialog
        open={recordDelete.open}
        busy={recordDelete.busy}
        error={recordDelete.error}
        title="Delete this record?"
        confirmLabel="Delete record"
        onCancel={() => { recordDelete.cancel(); setPendingRecord(null); }}
        onConfirm={recordDelete.confirm}
        body={pendingRecord && (
          <>
            <p>
              <strong>{serviceItemsSummaryLabel(pendingRecord.services)}</strong>
              {pendingRecord.serviceDate && <> &mdash; {formatDate(pendingRecord.serviceDate)}</>}
            </p>
            <p>
              It disappears from this vehicle's history and from everything worked out from it.
              There is no undo.
            </p>
          </>
        )}
      />
    </main>
  );
}
