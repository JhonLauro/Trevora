/**
 * Spend categories for the dashboard's "Where it went".
 *
 * Four buckets, ordered by how much of a typical owner's spend they carry.
 * Keyword-derived for now; like component attribution this belongs on the
 * record so it can be corrected (planning/DEFERRED.md).
 */
import { componentEvidenceText } from './serviceComponents';
import { serviceItemsArray } from './serviceText';

/* "Other" is last and is not a category — it is the absence of one. It used
   to be labelled as though it were a fourth kind of spend, which told an
   owner nothing: they could see money in it and had no way to find out what.
   The label says what it means now, and `spendByCategory` returns the service
   names inside each bucket so the panel can show them without a hover. */
export const UNCATEGORISED = 'Not categorised';

export const CATEGORY_ORDER = ['Maintenance', 'Repairs', 'Tires & brakes', UNCATEGORISED];

const CATEGORY_RULES = [
  ['Tires & brakes', /\btire|tyre|wheel|alignment|balanc|brake|rotor|pad|caliper/i],
  ['Repairs', /\brepair|replace|fix|leak|overheat|fail|broken|rebuild|diagnos/i],
  ['Maintenance', /\boil|filter|pms|tune|change|service|flush|coolant|lubricat|inspect|check/i],
];

export function categoryForRecord(record) {
  // Operations only, same rule as component attribution: a tin of thinner
  // should not file a scratch repair under "Tires & brakes", and neither
  // should the shop's name.
  const haystack = componentEvidenceText(record);
  const match = CATEGORY_RULES.find(([, pattern]) => pattern.test(haystack));
  return match ? match[0] : UNCATEGORISED;
}

/** The service names in a record, for naming what is inside a bucket. */
function serviceNames(record) {
  return serviceItemsArray(record?.services)
    .map((item) => String(item?.serviceType || '').trim())
    .filter(Boolean);
}

/**
 * Totals per category across records, always returning all four buckets in
 * order — a category at zero is information ("nothing broke this year").
 */
export function spendByCategory(records) {
  const totals = Object.fromEntries(CATEGORY_ORDER.map((name) => [name, 0]));
  const counts = Object.fromEntries(CATEGORY_ORDER.map((name) => [name, 0]));
  const names = Object.fromEntries(CATEGORY_ORDER.map((name) => [name, new Set()]));

  (records || []).forEach((record) => {
    const category = categoryForRecord(record);
    totals[category] += Number(record.totalCost || 0);
    counts[category] += 1;
    serviceNames(record).forEach((name) => names[category].add(name));
  });

  const grandTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);

  return CATEGORY_ORDER.map((name) => ({
    name,
    total: totals[name],
    count: counts[name],
    /* What is actually in the bucket, so a row can say so on the page rather
       than in a tooltip. Capped at three: this is a label, not a list, and
       the records table is where the full answer lives. */
    examples: [...names[name]].slice(0, 3),
    percent: grandTotal > 0 ? Math.round((totals[name] / grandTotal) * 100) : 0,
  }));
}
