import React from 'react';
import { formatAmount } from '../../utils/format';
import { seriesMax } from '../../utils/monthlySeries';

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
 * Accessibility: the chart is `role="img"` with a summarising label, and the
 * same numbers are available to a screen reader as a real table.
 */
export default function MonthBars({ series, label, highlightPeak = false, showRange = false, showAxis = false }) {
  const max = seriesMax(series);
  const peakTotal = highlightPeak ? max : null;

  return (
    <div>
      <div className="ink-bars" role="img" aria-label={label}>
        {series.map((bucket) => {
          const percent = max > 0 ? Math.round((bucket.total / max) * 100) : 0;
          return (
            <div className="ink-bars__col" key={bucket.key}>
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
