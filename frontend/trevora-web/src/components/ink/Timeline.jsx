import React from 'react';
import { Link } from 'react-router-dom';
import { formatAmount, formatDay, formatOdometer } from '../../utils/format';
import { recordStatus, recordStatusLabel, sourceLabel } from '../../utils/recordStatus';
import { serviceItemsSummaryLabel } from '../../utils/serviceText';

/**
 * Records grouped by year, newest first.
 *
 * This is the default view and the one most people will see first, because
 * the parts map has no artwork yet. It is worth building well on its own
 * terms rather than treating it as a fallback.
 *
 * The vertical rule runs the full height of each row so entries connect into
 * one line; the dot sits at the top of the row, level with the date.
 */

/* OCR confidence is shown as a word, never a percentage. "82% confident" invites
   an argument about the number; "medium" invites a look at the record. */
function confidenceWord(record) {
  const raw = record?.ocrConfidence ?? record?.fieldMetadata?.confidence;
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'string') return raw.toLowerCase();
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const scaled = value > 1 ? value / 100 : value;
  if (scaled >= 0.8) return 'high';
  if (scaled >= 0.5) return 'medium';
  return 'low';
}

function metaLine(record) {
  const confidence = confidenceWord(record);
  return [
    record.shopName || 'Shop not provided',
    sourceLabel(record.sourceInputMethod),
    confidence ? `OCR ${confidence}` : null,
  ].filter(Boolean).join(' · ');
}

function groupByYear(records) {
  const groups = [];
  records.forEach((record) => {
    const year = String(record.serviceDate || '').slice(0, 4) || 'No date';
    const group = groups.find((entry) => entry.year === year);
    if (group) group.records.push(record);
    else groups.push({ year, records: [record] });
  });
  return groups;
}

export default function Timeline({ records, vehicleId, onDelete }) {
  const groups = groupByYear(records);

  return (
    <div className="ink-card vehicle-timeline">
      {groups.map((group) => (
        <section className="vehicle-timeline__year" key={group.year}>
          <div className="vehicle-timeline__year-head">
            <h3>{group.year}</h3>
            <span className="vehicle-timeline__year-rule" aria-hidden="true" />
          </div>

          {group.records.map((record) => {
            const status = recordStatus(record);
            return (
              <article className="vehicle-timeline__row" key={record.recordId}>
                <div className="vehicle-timeline__when">
                  <span className="vehicle-timeline__date">{formatDay(record.serviceDate)}</span>
                  <span className="vehicle-timeline__odo">{formatOdometer(record.odometer, 'No odometer')}</span>
                </div>

                <div className="vehicle-timeline__rail" aria-hidden="true">
                  <span className={`vehicle-timeline__dot is-${status}`} />
                </div>

                <div className="vehicle-timeline__card">
                  <div className="vehicle-timeline__card-main">
                    <h4>{serviceItemsSummaryLabel(record.services)}</h4>
                    <p>{metaLine(record)}</p>
                  </div>
                  <div className="vehicle-timeline__card-side">
                    <span className={`ink-badge ink-badge--${status}`}>{recordStatusLabel(record)}</span>
                    {/* A fixed-width cost box so figures line up down the column
                        even though each card sizes itself. */}
                    <span className="vehicle-timeline__cost">{formatAmount(record.totalCost)}</span>
                    <Link className="ink-table__action" to={`/vehicles/${vehicleId}/history/${record.recordId}`}>
                      Open
                    </Link>
                    {onDelete && (
                      <button
                        className="ink-link-button ink-link-button--danger"
                        type="button"
                        aria-label={`Delete the ${serviceItemsSummaryLabel(record.services)} record`}
                        onClick={() => onDelete(record)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
