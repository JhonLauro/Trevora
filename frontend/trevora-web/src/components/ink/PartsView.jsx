import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatAmount, formatDate, formatOdometer } from '../../utils/format';
import { recordStatus, recordStatusLabel, sourceLabel } from '../../utils/recordStatus';
import { serviceItemsSummaryLabel } from '../../utils/serviceText';
import { STATUS_TEXT } from '../../utils/componentStatus';
import { componentNumbersFor } from '../../utils/serviceComponents';
import VehicleDiagram from './VehicleDiagram.jsx';
import { hasVehicleShape, vehicleViews } from './vehicleShapes';

/**
 * Components view: the parts map over the component list.
 *
 * Two views — the side profile and the engine bay — each carrying the
 * components that live in it, so the list underneath is "components in this
 * view". A component can appear in both, because some genuinely live in more
 * than one place. See vehicleShapes.js for the geometry, for why the side view
 * is per body type while the bay is per vehicle class, and for why front and
 * rear are gone.
 *
 * **Numbers are global, not per view.** Each one is the component's position
 * in its class taxonomy, so 5 is Tires on both tabs and on every body type,
 * and switching tabs does not renumber anything. The list is ordered to match,
 * which is why it reads 1-6 on the side and 7-13 under the bonnet rather than
 * putting the documented components first.
 *
 * The view tabs are the only real buttons on the map. The markers are
 * `aria-hidden`, because each one duplicates a list row and putting the same
 * controls in the tab order twice is worse than a pointer-only map; the tabs
 * have no equivalent in the list, so they are focusable. Selection is owned by
 * the row: hovering a marker mirrors its row, not the other way round.
 *
 * A vehicle whose `bodyType` is null gets no drawing and no tabs, and the note
 * says so rather than picking a silhouette on the owner's behalf. Rows created
 * before the body-type picker existed are all in this state, and they fall
 * back to the full component list.
 *
 * The list itself is already class-correct — a motorcycle shows a drive chain
 * and no aircon (see utils/serviceComponents.js).
 */
const LEGEND = ['ok', 'none'];

function Rail({ entry, recordHref }) {
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
                  <Link to={recordHref(record)}>
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

/**
 * `recordHref` exists because the mechanic view reaches the same records by a
 * different route — a share session, not an owned vehicle. Defaulting it to
 * the owner path keeps every existing caller unchanged.
 */
export default function PartsView({
  entries,
  vehicleId,
  vehicleClass = 'car',
  bodyType = null,
  recordHref = (record) => `/vehicles/${vehicleId}/history/${record.recordId}`,
}) {
  const views = useMemo(() => vehicleViews(bodyType), [bodyType]);
  const [viewId, setViewId] = useState('side');
  const [selectedKey, setSelectedKey] = useState(null);
  const [hoverKey, setHoverKey] = useState(null);

  const activeView = views.find((view) => view.id === viewId) ?? views[0] ?? null;

  // Each view carries only the components that live in it, so the list under
  // the map is "components in this view" rather than the whole taxonomy. With
  // no drawing at all (unknown body type) the list falls back to everything,
  // which is what it showed before the map existed.
  //
  // Both the order and the numbers come from the class taxonomy rather than
  // from the incoming sort, so the numbers stay put across tabs and the list
  // still counts upwards.
  const visible = useMemo(() => {
    const numbers = componentNumbersFor(vehicleClass);
    return entries
      .filter((entry) => (activeView ? activeView.shape.anchors[entry.key] : true))
      .map((entry, index) => ({ ...entry, number: numbers[entry.key] ?? index + 1 }))
      .sort((a, b) => a.number - b.number);
  }, [entries, activeView, vehicleClass]);

  // A selection can fall out from under us two ways: records change and
  // re-sort the list, or the user switches to a view that does not carry the
  // selected component. Both leave the rail describing nothing.
  useEffect(() => {
    if (!visible.some((entry) => entry.key === selectedKey)) {
      setSelectedKey(visible[0]?.key ?? null);
    }
  }, [visible, selectedKey]);

  const selected = visible.find((entry) => entry.key === selectedKey) ?? null;

  return (
    <div className="parts-view">
      <section className="ink-card parts-panel">
        <div className="parts-panel__head">
          <div>
            <h2 className="ink-section-title">Where work has been done</h2>
            <p className="parts-panel__sub">Pick a part to see its full service history.</p>
          </div>
        </div>

        {views.length > 1 && (
          /* Real buttons, unlike the markers: this is the one control on the
             map that has no equivalent in the list below it. */
          <div className="parts-views" role="group" aria-label="Vehicle view">
            {views.map((view) => (
              <button
                key={view.id}
                type="button"
                className={`parts-views__tab${view.id === activeView.id ? ' is-active' : ''}`}
                aria-pressed={view.id === activeView.id}
                onClick={() => setViewId(view.id)}
              >
                {view.label}
              </button>
            ))}
          </div>
        )}

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

        <VehicleDiagram
          shape={activeView?.shape ?? null}
          entries={visible}
          selectedKey={selectedKey}
          hoverKey={hoverKey}
          onSelect={setSelectedKey}
          onHover={setHoverKey}
        />

        {!hasVehicleShape(bodyType) && (
          <p className="parts-panel__note">
            This {vehicleClass === 'motorcycle' ? 'motorcycle' : 'vehicle'} has no body type on
            record, so there is no diagram to draw it on — every part is listed below instead.
            Setting the body type on the vehicle turns the diagram on.
          </p>
        )}

        <div className="parts-panel__count">
          <span className="ink-eyebrow">{activeView ? 'Components in this view' : 'Components'}</span>
          <span className="ink-eyebrow">{visible.length} shown</span>
        </div>

        <ul className="parts-list">
          {visible.map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                className={`parts-list__row${entry.key === selectedKey ? ' is-selected' : ''}${
                  entry.key === hoverKey && entry.key !== selectedKey ? ' is-hovered' : ''}`}
                aria-pressed={entry.key === selectedKey}
                onClick={() => setSelectedKey(entry.key)}
                onMouseEnter={() => setHoverKey(entry.key)}
                onMouseLeave={() => setHoverKey(null)}
              >
                <span className="parts-list__index ink-mono" aria-hidden="true">{entry.number}</span>
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

      <Rail entry={selected} recordHref={recordHref} />
    </div>
  );
}
