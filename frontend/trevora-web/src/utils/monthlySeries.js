/**
 * Spend buckets by month, oldest first.
 *
 * Feeds both charts on the dashboard: the per-card activity strip and the
 * combined spending panel. Both are plain divs — no charting library.
 */

const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * The last `months` whole months, ending on the current one.
 *
 * @returns {{key: string, label: string, monthLabel: string, total: number}[]}
 */
export function monthSeries(records, months = 12, now = new Date()) {
  const span = Math.max(1, Math.round(months));
  const buckets = [];
  const index = new Map();

  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const bucket = {
      key,
      monthLabel: MONTH_LABELS[date.getMonth()],
      label: `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`,
      total: 0,
      /* The records that landed in this month, so a chart can say what a bar
         is made of rather than only how tall it is. Kept as references, not
         copies — nothing here owns them. */
      records: [],
    };
    index.set(key, bucket);
    buckets.push(bucket);
  }

  (records || []).forEach((record) => {
    if (!record.serviceDate) return;
    const key = String(record.serviceDate).slice(0, 7);
    const bucket = index.get(key);
    if (!bucket) return;
    bucket.total += Number(record.totalCost || 0);
    bucket.records.push(record);
  });

  return buckets;
}

/** Twelve months. The common case, kept as its own name because most call
    sites want exactly this and should not have to say so. */
export function lastTwelveMonths(records, now = new Date()) {
  return monthSeries(records, 12, now);
}

/**
 * Every month from the first record to now.
 *
 * Capped at five years. Beyond that the bars are too narrow to read and the
 * chart stops being a chart — an owner with eight years of history is better
 * served by the records table, which is one click away. Floors at 12 so
 * "All time" never renders a chart narrower than the 12-month view it
 * replaced.
 */
export function allTimeSeries(records, now = new Date()) {
  const dated = (records || []).map((record) => record.serviceDate).filter(Boolean).sort();
  if (!dated.length) return monthSeries(records, 12, now);

  const first = new Date(`${String(dated[0]).slice(0, 7)}-01T00:00:00`);
  if (Number.isNaN(first.getTime())) return monthSeries(records, 12, now);

  const months = (now.getFullYear() - first.getFullYear()) * 12
    + (now.getMonth() - first.getMonth()) + 1;

  return monthSeries(records, Math.min(60, Math.max(12, months)), now);
}

/** What a series adds up to. */
export function seriesTotal(series) {
  return (series || []).reduce((sum, bucket) => sum + bucket.total, 0);
}

/**
 * The same span again, immediately before the one given — so "last 3 months"
 * can be compared with the 3 months before it.
 *
 * Returns null when there is no complete previous period to compare against:
 * a first month of use has nothing behind it, and inventing a zero would
 * report a 100% fall every time somebody starts using the product.
 */
export function previousPeriodTotal(records, months, now = new Date()) {
  const span = Math.max(1, Math.round(months));
  const end = new Date(now.getFullYear(), now.getMonth() - span, 1);
  const series = monthSeries(records, span, end);

  const anyRecordBefore = (records || []).some((record) => {
    if (!record.serviceDate) return false;
    return String(record.serviceDate).slice(0, 7) <= series[series.length - 1].key;
  });

  return anyRecordBefore ? seriesTotal(series) : null;
}

export function seriesMax(series) {
  return series.reduce((max, bucket) => Math.max(max, bucket.total), 0);
}

export function peakMonth(series) {
  return series.reduce((peak, bucket) => (bucket.total > (peak?.total ?? 0) ? bucket : peak), null);
}
