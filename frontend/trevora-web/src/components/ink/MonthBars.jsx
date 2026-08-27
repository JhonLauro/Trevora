import React from 'react';
import { formatAmount, pluralize } from '../../utils/format';
import { seriesMax } from '../../utils/monthlySeries';
import { serviceItemsArray } from '../../utils/serviceText';

/**
 * A twelve-month spend chart made of plain divs.
 *
 * No charting library, no SVG, no canvas — twelve flex columns and a
 * percentage height. Both places this appears (the per-vehicle activity strip
 * and the dashboard spending panel) are the same construction at two sizes.
 *
 * `max` is per-chart, so a vehicle card's strip is a shape rather than a
 * comparison across cards.
 *
 * `interactive` adds a tooltip per month — the amount and what it was spent
 * on. It is opt-in rather than always on because the dashboard renders one
 * large chart and up to six card-sized strips, and making every column of
 * every strip focusable would put seventy-odd tab stops between the top of
 * the page and the table below it. Only the large chart takes it.
 *
 * Accessibility: the chart is `role="img"` with a summarising label, and the
 * same numbers are available to a screen reader as a real table — which is
 * also the reason the tooltip can be a convenience rather than the only route
 * to the detail. Months with nothing in them are not focusable: an empty
 * month has nothing to say and would be a tab stop that answers nothing.
 */

/* What the month was spent on, named. Distinct service types, capped at two —
   this is a tooltip, not a list, and the records table is where the full
   answer lives. */
function monthDetail(bucket) {
  const names = [];
  (bucket.records || []).forEach((record) => {
    serviceItemsArray(record?.services).forEach((item) => {
      const name = String(item?.serviceType || '').trim();
      if (name && !names.includes(name)) names.push(name);
    });
  });
  return names.slice(0, 2);
}

export default function MonthBars({
  series,
  label,
  highlightPeak = false,
  showRange = false,
  showAxis = false,
  interactive = false,
}) {
  const max = seriesMax(series);
  const peakTotal = highlightPeak ? max : null;

  return (
    <div>
      <div className="ink-bars" role="img" aria-label={label}>
        {series.map((bucket) => {
          const percent = max > 0 ? Math.round((bucket.total / max) * 100) : 0;
          const detail = interactive ? monthDetail(bucket) : [];
          const count = bucket.records?.length ?? 0;
          const canHover = interactive && bucket.total > 0;

          return (
            <div
              className="ink-bars__col"
              key={bucket.key}
              tabIndex={canHover ? 0 : undefined}
              aria-hidden={canHover ? undefined : 'true'}
            >
              {bucket.total > 0 ? (
                <div
                  className={`ink-bars__bar${peakTotal && bucket.total === peakTotal ? ' is-peak' : ''}`}
                  style={{ height: `${Math.max(percent, 4)}%` }}
                />
              ) : (
                /* No service that month renders a tick, not an empty slot —
                   the gaps are what the chart is for. */
                <div className="ink-bars__tick" />
              )}

              {canHover && (
                <span className="ink-bars__tip" role="tooltip">
                  <strong>{bucket.label}</strong>
                  <span className="ink-bars__tip-value">{formatAmount(bucket.total)}</span>
                  {count > 0 && (
                    <span>
                      {pluralize(count, 'record')}
                      {detail.length > 0 ? ` · ${detail.join(', ')}` : ''}
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {showRange && (
        <div className="ink-bars__range ink-mono">
          <span>{series[0]?.label}</span>
          <span>{series[series.length - 1]?.label}</span>
        </div>
      )}

      {showAxis && (
        <div className="ink-axis ink-mono" aria-hidden="true">
          {series.map((bucket) => <span key={bucket.key}>{bucket.monthLabel}</span>)}
        </div>
      )}

      {/* The clipping class goes on a wrapper, not the table: a table box is
          never narrower than its min-content width, so `width: 1px` on the
          <table> itself left a 440px element sticking out of the page. */}
      <div className="ink-sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Amount in pesos</th>
            </tr>
          </thead>
          <tbody>
            {series.map((bucket) => (
              <tr key={bucket.key}>
                <th scope="row">{bucket.label}</th>
                <td>{formatAmount(bucket.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
