import { needsReview } from './recordStatus';
import { COMPONENT_LABELS, inferComponents } from './serviceComponents';

/**
 * What a shared history says that a mechanic could not see by reading it.
 *
 * The records list answers "what was done". These answer the questions a
 * mechanic actually arrives with — is the odometer believable, what has
 * nobody touched, and what keeps coming back — and every one of them is
 * derived from fields the mechanic is already sent. Nothing here needs a
 * new table or a new API call.
 *
 * Every finding states what it is evidence *of*, and stops there. A gap in
 * the history is a gap in the paperwork, not proof of neglect; a repeated
 * repair is worth a look, not a diagnosis. Overclaiming here would be the
 * same failure as labelling every record "Validated".
 */

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function dated(records) {
  return records
    .filter((record) => record.serviceDate)
    .sort((a, b) => String(a.serviceDate).localeCompare(String(b.serviceDate)));
}

/**
 * Odometer readings that go backwards over time.
 *
 * The single check a used-vehicle buyer most wants and can least perform.
 * Reported as "these two readings disagree", never as "the odometer was
 * rolled back" — a transposed digit at the counter produces exactly the same
 * pattern, and the honest claim is the one the data supports.
 */
export function odometerFindings(records) {
  const readings = dated(records).filter((record) => record.odometer != null);
  if (readings.length < 2) return { inconsistencies: [], kmPerYear: null, readingCount: readings.length };

  const inconsistencies = [];
  for (let i = 1; i < readings.length; i += 1) {
    const previous = readings[i - 1];
    const current = readings[i];
    if (Number(current.odometer) < Number(previous.odometer)) {
      inconsistencies.push({
        from: previous,
        to: current,
        drop: Number(previous.odometer) - Number(current.odometer),
      });
    }
  }

  const first = readings[0];
  const last = readings[readings.length - 1];
  const span = new Date(last.serviceDate) - new Date(first.serviceDate);
  const distance = Number(last.odometer) - Number(first.odometer);
  // Under a season apart, the annualised figure is noise dressed as a rate.
  const kmPerYear = span > MS_PER_YEAR / 4 && distance > 0
    ? Math.round(distance / (span / MS_PER_YEAR))
    : null;

  return { inconsistencies, kmPerYear, readingCount: readings.length };
}

/**
 * Calendar years between the first and last record with nothing filed.
 *
 * Only ever within the documented span: the years before a vehicle's first
 * record are not gaps, they are simply years this owner was not using
 * Trevora, and counting them would manufacture neglect.
 */
export function historyGaps(records) {
  const withDates = dated(records);
  if (withDates.length < 2) return { years: [], firstYear: null, lastYear: null };

  const firstYear = new Date(withDates[0].serviceDate).getFullYear();
  const lastYear = new Date(withDates[withDates.length - 1].serviceDate).getFullYear();
  const documented = new Set(withDates.map((record) => new Date(record.serviceDate).getFullYear()));

  const years = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    if (!documented.has(year)) years.push(year);
  }

  return { years, firstYear, lastYear };
}

/**
 * Components serviced three or more times inside two years.
 *
 * A repeat is normal — brake pads wear out. A third visit inside two years
 * is the pattern worth mentioning, because a repair that did not hold looks
 * exactly like routine maintenance until you count it.
 */
export function recurringWork(records, vehicleClass = 'car', { minimumVisits = 3, withinYears = 2 } = {}) {
  const cutoff = Date.now() - withinYears * MS_PER_YEAR;
  const recent = dated(records).filter((record) => new Date(record.serviceDate).getTime() >= cutoff);

  const counts = new Map();
  recent.forEach((record) => {
    // inferComponents reads the service type and OPERATION lines only — the
    // narrowing from migration 011. Counting materials would file a tin of
    // brake cleaner as a brake job. The class matters too: a rider's chain
    // service has no car equivalent to be folded into.
    new Set(inferComponents(record, vehicleClass)).forEach((component) => {
      counts.set(component, (counts.get(component) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .filter(([, count]) => count >= minimumVisits)
    .sort((a, b) => b[1] - a[1])
    .map(([component, count]) => ({
      component,
      count,
      label: COMPONENT_LABELS[component] ?? component,
    }));
}

/** How much of this history a human has actually vouched for. */
export function trustSummary(records) {
  const unverified = records.filter(needsReview).length;
  return { total: records.length, unverified, verified: records.length - unverified };
}
