import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatAmount, formatDate, formatOdometer } from '../../utils/format';
import { recordStatus, recordStatusLabel, sourceLabel } from '../../utils/recordStatus';
import { serviceItemsSummaryLabel } from '../../utils/serviceText';
import { STATUS_TEXT } from '../../utils/componentStatus';

/**
 * Components view.
 *
 * The design calls for a diagram of the vehicle with markers over it. There
 * is no artwork yet: the silhouette depends on body type — a pickup, van and
 * sedan are different shapes with parts in different places, and a motorcycle
 * shares none of them — so the asset is bodyType × view.
 *
 * Rather than ship a dashed placeholder, this renders the component list
 * alone with one line saying why. Nothing is lost: the list was always the
 * accessible path through this view, since a map of markers has to be a list
 * of buttons for a keyboard or a screen reader anyway. When the artwork
 * lands, the map goes above this list and the numbering already matches.
 *
 * The list itself is already class-correct — a motorcycle shows a drive chain
 * and no aircon (see utils/serviceComponents.js).
 */
const LEGEND = ['ok', 'none'];

function Rail({ entry, vehicleId }) {
  if (!entry) return null;

  const records = entry.records;

  return (
    <aside className="parts-rail">
      <section className="ink-card parts-rail__card">
        <div className="parts-rail__head">
          <span className="ink-eyebrow">Selected component</span>
          <div className="parts-rail__title">
            <h3>{entry.label}</h3>
            <span className={`ink-badge ink-badge--${entry.status}`}>{entry.statusText}</span>
          </div>
        </div>
        <div className="parts-rail__stats">
          <div>
            <span className="ink-eyebrow">Last service</span>
            <strong>{entry.lastService ? formatDate(entry.lastService) : 'None'}</strong>
          </div>
          <div>
            <span className="ink-eyebrow">At odometer</span>
            <strong>{formatOdometer(entry.lastOdometer, 'Not recorded')}</strong>
          </div>
          <div>
            <span className="ink-eyebrow">Records</span>
            <strong>{records.length}</strong>
          </div>
          <div>
            <span className="ink-eyebrow">Total cost</span>
            <strong>PHP {formatAmount(entry.totalCost)}</strong>
          </div>
        </div>
      </section>

      {records.length > 0 && (
        <section className="ink-card parts-rail__card">
          <div className="parts-rail__head parts-rail__head--row">
            <span className="ink-eyebrow">Records for this component</span>
            <span className="ink-muted-note">All {records.length}</span>
          </div>
          <div className="parts-rail__records">
            {records.slice(0, 4).map((record) => (
              <article key={record.recordId}>
                <div className="parts-rail__record-line">
                  <Link to={`/vehicles/${vehicleId}/history/${record.recordId}`}>
                    {serviceItemsSummaryLabel(record.services)}
                  </Link>
                  <strong>{formatAmount(record.totalCost)}</strong>
                </div>
                <p>
                  {[formatDate(record.serviceDate), formatOdometer(record.odometer, null), record.shopName]
                    .filter(Boolean).join(' · ')}
                </p>
                <div className="parts-rail__chips">
                  <span className={`ink-badge ink-badge--${recordStatus(record)}`}>
                    {recordStatusLabel(record)}
                  </span>
                  <span className="ink-badge ink-badge--none">{sourceLabel(record.sourceInputMethod)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="ink-card parts-rail__card">
        <span className="ink-eyebrow">About this part</span>
        {/* Deliberately not a due date. Predicting the next service needs a
            real interval per vehicle class, which does not exist yet, and
            guessing one from car conventions told riders their engine was
            fine when it was not. */}
        <p className="parts-rail__due">
          {records.length ? (
            <>
              {entry.label} appears in {records.length === 1 ? 'one record' : `${records.length} records`},
              most recently on <strong>{formatDate(entry.lastService)}</strong>
              {entry.lastOdometer != null && <> at <strong>{formatOdometer(entry.lastOdometer)}</strong></>}.
            </>
          ) : (
            <>Nothing in this history mentions {entry.label.toLowerCase()}. If it has been serviced, the receipt is worth adding.</>
          )}
        </p>
      </section>

    </aside>
  );
}

export default function PartsView({ entries, vehicleId, vehicleClass = 'car' }) {
  const [selectedKey, setSelectedKey] = useState(entries[0]?.key ?? null);

  // The list re-orders as records change; a selection pointing at a component
  // that is no longer listed would leave the rail describing nothing.
  useEffect(() => {
    if (!entries.some((entry) => entry.key === selectedKey)) {
      setSelectedKey(entries[0]?.key ?? null);
    }
  }, [entries, selectedKey]);

  const selected = entries.find((entry) => entry.key === selectedKey) ?? null;

  return (
    <div className="parts-view">
      <section className="ink-card parts-panel">
        <div className="parts-panel__head">
          <div>
            <h2 className="ink-section-title">Where work has been done</h2>
            <p className="parts-panel__sub">Pick a part to see its full service history.</p>
          </div>
        </div>

        {/* Always visible: it is the key to the whole view, and status is
            never colour-only, so each swatch carries its word. */}
        <ul className="parts-legend">
          {LEGEND.map((status) => (
            <li key={status}>
              <span className={`parts-dot is-${status}`} aria-hidden="true" />
              {STATUS_TEXT[status]}
            </li>
          ))}
        </ul>

        <p className="parts-panel__note">
          The {vehicleClass === 'motorcycle' ? 'motorcycle' : 'car'} diagram is not drawn yet, so
          every part is listed here instead. The list is the same information the diagram would
          show.
        </p>

        <div className="parts-panel__count">
          <span className="ink-eyebrow">Components</span>
          <span className="ink-eyebrow">{entries.length} shown</span>
        </div>

        <ul className="parts-list">
          {entries.map((entry, index) => (
            <li key={entry.key}>
              <button
                type="button"
                className={`parts-list__row${entry.key === selectedKey ? ' is-selected' : ''}`}
                aria-pressed={entry.key === selectedKey}
                onClick={() => setSelectedKey(entry.key)}
              >
                <span className="parts-list__index ink-mono" aria-hidden="true">{index + 1}</span>
                <span className="parts-list__copy">
                  <strong>{entry.label}</strong>
                  <small className={`is-${entry.status}`}>{entry.statusText}</small>
                </span>
                <span className={`parts-dot is-${entry.status}`} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Rail entry={selected} vehicleId={vehicleId} />
    </div>
  );
}
