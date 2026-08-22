/**
 * History completeness — how many years of ownership have any record at all.
 *
 * This is the one thing on the vehicle page that motivates uploading old
 * receipts, and the dashed empty blocks are what make a gap look like
 * something missing rather than something small.
 *
 * There is no ownership-start field on the vehicle yet
 * (planning/DEFERRED.md), so the strip starts at the earliest record year and
 * the copy says "Records from {year}" — inventing a purchase date would be
 * making up the very number the strip is supposed to be honest about.
 */

export function historyCompleteness(records, vehicle, now = new Date()) {
  const years = (records || [])
    .map((record) => Number(String(record.serviceDate || '').slice(0, 4)))
    .filter((year) => Number.isFinite(year) && year > 1900);

  if (!years.length) return null;

  const documented = new Set(years);
  const startYear = Math.min(...years);
  const endYear = now.getFullYear();

  const span = [];
  for (let year = startYear; year <= endYear; year += 1) {
    span.push({ year, documented: documented.has(year) });
  }

  return {
    years: span,
    documentedCount: span.filter((entry) => entry.documented).length,
    totalYears: span.length,
    missing: span.filter((entry) => !entry.documented).map((entry) => entry.year),
    // True once the vehicle record carries a real ownership start. Until then
    // the heading says "Records from", not "Ownership from".
    ownershipKnown: false,
    startYear,
  };
}

/** "2021 and 2023" / "2021, 2022 and 2024" — a bare list reads as data, not a sentence. */
export function listYears(years) {
  if (!years.length) return '';
  if (years.length === 1) return String(years[0]);
  return `${years.slice(0, -1).join(', ')} and ${years[years.length - 1]}`;
}
