/**
 * Twelve-month spend buckets, oldest first.
 *
 * Feeds both charts on the dashboard: the per-card activity strip and the
 * combined spending panel. Both are plain divs — no charting library.
 */

const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * @returns {{key: string, label: string, monthLabel: string, total: number}[]}
 *   exactly 12 entries, ending on the current month.
 */
export function lastTwelveMonths(records, now = new Date()) {
  const buckets = [];
  const index = new Map();

  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const bucket = {
      key,
      monthLabel: MONTH_LABELS[date.getMonth()],
      label: `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`,
      total: 0,
    };
    index.set(key, bucket);
    buckets.push(bucket);
  }

  (records || []).forEach((record) => {
    if (!record.serviceDate) return;
    const key = String(record.serviceDate).slice(0, 7);
    const bucket = index.get(key);
    if (bucket) bucket.total += Number(record.totalCost || 0);
  });

  return buckets;
}

export function seriesMax(series) {
  return series.reduce((max, bucket) => Math.max(max, bucket.total), 0);
}

export function peakMonth(series) {
  return series.reduce((peak, bucket) => (bucket.total > (peak?.total ?? 0) ? bucket : peak), null);
}
