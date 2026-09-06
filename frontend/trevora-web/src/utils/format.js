/**
 * Shared display formatting.
 *
 * Currency rule: never repeat "PHP" per row. A stat that stands alone gets
 * `PHP 48,320`; a table states it once in the header and the cells carry bare
 * numbers.
 */

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const dayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
const numberFormatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });

export function toDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, fallback = 'No date') {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : fallback;
}

/** Day and month only — for grouped views where the year is the group heading. */
export function formatDay(value, fallback = 'No date') {
  const date = toDate(value);
  return date ? dayFormatter.format(date) : fallback;
}

export function formatMonthYear(value, fallback = 'No date') {
  const date = toDate(value);
  return date ? shortDateFormatter.format(date) : fallback;
}

/** Bare number, for cells under a "Cost (PHP)" header. */
export function formatAmount(value) {
  return numberFormatter.format(Number(value || 0));
}

/** Standalone value, for a stat that carries no currency label of its own. */
export function formatMoney(value) {
  return `PHP ${formatAmount(value)}`;
}

/**
 * A bare grouped distance, for a sentence that carries "km" itself.
 *
 * `formatOdometer` puts the unit on every number, which reads as
 * "42,300 km of 100,000 km" once two of them appear in one line.
 */
export function formatKilometres(value) {
  return numberFormatter.format(Number(value || 0));
}

export function formatOdometer(value, fallback = 'No odometer') {
  if (value === null || value === undefined || value === '') return fallback;
  return `${numberFormatter.format(Number(value))} km`;
}

export function daysSince(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  return Math.max(0, Math.round((now - date) / 86400000));
}

/** "today" / "yesterday" / "12 days ago" — a raw 0 reads as an error. */
export function relativeDays(value) {
  const days = daysSince(value);
  if (days === null) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
