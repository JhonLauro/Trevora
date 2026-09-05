import React from 'react';
import { useT } from '../../i18n/index.jsx';
import RecordCost from './RecordCost.jsx';
import { Link } from 'react-router-dom';
import { formatDate, formatOdometer } from '../../utils/format';
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
/* The design specified 108px for Date. Against real records "Aug 15, 2026"
   does not fit and every row wrapped to two lines, so it is 118px here. */
const CROSS_VEHICLE_COLUMNS = '118px 168px minmax(0, 1fr) 112px 152px 60px';
const SINGLE_VEHICLE_COLUMNS = '118px minmax(0, 1fr) 116px 112px 152px 60px';

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

export default function RecordsTable({ records, ariaLabel, showVehicle = true, onDelete }) {
  const t = useT();
  /* The action column widens when it holds two controls rather than one. */
  const columns = (showVehicle ? CROSS_VEHICLE_COLUMNS : SINGLE_VEHICLE_COLUMNS)
    .replace(/ 60px$/, onDelete ? ' 132px' : ' 60px');

  return (
    <>
      <table className="ink-table" style={{ '--table-columns': columns }} aria-label={ariaLabel}>
        <thead>
          <tr>
            <th scope="col">{t('table.date')}</th>
            {showVehicle && <th scope="col">{t('table.vehicle')}</th>}
            <th scope="col">{t('table.service')}</th>
            {!showVehicle && <th scope="col">{t('table.odometer')}</th>}
            <th scope="col" className="is-numeric">{t('table.cost')}</th>
            <th scope="col">{t('table.status')}</th>
            <th scope="col"><span className="ink-sr-only">{t('table.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.recordId}>
              <td className="is-muted is-date">{formatDate(record.serviceDate)}</td>
              {showVehicle && <td className="is-muted">{record.vehicleName}</td>}
              <td className="ink-table__service">
                <strong>{serviceItemsSummaryLabel(record.services)}</strong>
                <small>{subLine(record)}</small>
              </td>
              {!showVehicle && <td className="is-muted">{formatOdometer(record.odometer, '—')}</td>}
              <td className="is-numeric"><RecordCost record={record} /></td>
              <td>
                <span className={`ink-badge ink-badge--${recordStatus(record)}`}>
                  {recordStatusLabel(record)}
                </span>
              </td>
              <td className="ink-table__actions">
                <Link className="ink-table__action" to={recordHref(record)}>{t('table.view')}</Link>
                {onDelete && (
                  <button
                    className="ink-link-button ink-link-button--danger"
                    type="button"
                    aria-label={`Delete the ${serviceItemsSummaryLabel(record.services)} record`}
                    onClick={() => onDelete(record)}
                  >
                    {t('table.delete')}
                  </button>
                )}
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
                <strong>PHP <RecordCost record={record} /></strong>
              </div>
              <div className="ink-record-card__sub">
                {showVehicle ? `${record.vehicleName} · ${subLine(record)}` : subLine(record)}
              </div>
            </div>
            <div className="ink-record-card__actions">
              <Link className="ink-button ink-button--outline ink-button--sm" to={recordHref(record)}>
                {t('table.viewRecord')}
              </Link>
              {onDelete && (
                <button
                  className="ink-button ink-button--outline ink-button--sm ink-button--danger-outline"
                  type="button"
                  onClick={() => onDelete(record)}
                >
                  {t('table.delete')}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
