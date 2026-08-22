import React from 'react';
import { Link } from 'react-router-dom';
import { formatAmount, formatDate, formatOdometer } from '../../utils/format';
import { recordStatus, recordStatusLabel, sourceLabel } from '../../utils/recordStatus';
import { serviceItemsSummaryLabel } from '../../utils/serviceText';

/**
 * The service records table, in two shapes.
 *
 * Cross-vehicle (the Garage) carries a Vehicle column; a single vehicle's own
 * page drops it — the whole page is that car — and carries Odometer instead.
 * Everything else is identical, which is why this is one component.
 *
 * Two renderings of the same rows: a real <table> with column headers on wide
 * screens, and cards below 900px. It never scrolls horizontally — sideways
 * scroll hides the columns people came for, and this audience will not find
 * them.
 *
 * The status track is 152px rather than the badge's own width; at 128px the
 * "Needs review" badge fitted to the pixel, touched the action column, and
 * wrapped to two lines under zoom.
 *
 * Currency is stated once, in the "Cost (PHP)" header — the cells carry bare
 * numbers rather than repeating "PHP" on every row.
 */
const CROSS_VEHICLE_COLUMNS = '108px 168px minmax(0, 1fr) 112px 152px 60px';
const SINGLE_VEHICLE_COLUMNS = '108px minmax(0, 1fr) 116px 112px 152px 60px';

function recordHref(record) {
  return `/vehicles/${record.vehicleId}/history/${record.recordId}`;
}

/* Shop and source share one line. Neither earned a column: source is
   provenance rather than a category, and shop names are long enough that a
   column for them starved the service description, which is what people
   actually scan. */
function subLine(record) {
  return `${record.shopName || 'Shop not provided'} · ${sourceLabel(record.sourceInputMethod)}`;
}

export default function RecordsTable({ records, ariaLabel, showVehicle = true }) {
  const columns = showVehicle ? CROSS_VEHICLE_COLUMNS : SINGLE_VEHICLE_COLUMNS;

  return (
    <>
      <table className="ink-table" style={{ '--table-columns': columns }} aria-label={ariaLabel}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {showVehicle && <th scope="col">Vehicle</th>}
            <th scope="col">Service</th>
            {!showVehicle && <th scope="col">Odometer</th>}
            <th scope="col" className="is-numeric">Cost (PHP)</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="ink-sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.recordId}>
              <td className="is-muted">{formatDate(record.serviceDate)}</td>
              {showVehicle && <td className="is-muted">{record.vehicleName}</td>}
              <td className="ink-table__service">
                <strong>{serviceItemsSummaryLabel(record.services)}</strong>
                <small>{subLine(record)}</small>
              </td>
              {!showVehicle && <td className="is-muted">{formatOdometer(record.odometer, '—')}</td>}
              <td className="is-numeric">{formatAmount(record.totalCost)}</td>
              <td>
                <span className={`ink-badge ink-badge--${recordStatus(record)}`}>
                  {recordStatusLabel(record)}
                </span>
              </td>
              <td>
                <Link className="ink-table__action" to={recordHref(record)}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ink-record-cards">
        {records.map((record) => (
          <article className="ink-record-card" key={record.recordId}>
            <div className="ink-record-card__top">
              <h3 className="ink-record-card__title">{serviceItemsSummaryLabel(record.services)}</h3>
              <span className={`ink-badge ink-badge--${recordStatus(record)}`}>
                {recordStatusLabel(record)}
              </span>
            </div>
            <div>
              <div className="ink-record-card__meta">
                <span>{formatDate(record.serviceDate)}</span>
                <strong>PHP {formatAmount(record.totalCost)}</strong>
              </div>
              <div className="ink-record-card__sub">
                {showVehicle ? `${record.vehicleName} · ${subLine(record)}` : subLine(record)}
              </div>
            </div>
            <Link className="ink-button ink-button--outline ink-button--sm" to={recordHref(record)}>
              View record
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
