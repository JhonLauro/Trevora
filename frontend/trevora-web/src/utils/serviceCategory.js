/**
 * Spend categories for the dashboard's "Where it went".
 *
 * Four buckets, ordered by how much of a typical owner's spend they carry.
 * Keyword-derived for now; like component attribution this belongs on the
 * record so it can be corrected (planning/DEFERRED.md).
 */
import { componentEvidenceText } from './serviceComponents';

export const CATEGORY_ORDER = ['Maintenance', 'Repairs', 'Tires & brakes', 'Other'];

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
  return match ? match[0] : 'Other';
}

/**
 * Totals per category across records, always returning all four buckets in
 * order — a category at zero is information ("nothing broke this year").
 */
export function spendByCategory(records) {
  const totals = Object.fromEntries(CATEGORY_ORDER.map((name) => [name, 0]));
  (records || []).forEach((record) => {
    totals[categoryForRecord(record)] += Number(record.totalCost || 0);
  });
  const grandTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);
  return CATEGORY_ORDER.map((name) => ({
    name,
    total: totals[name],
    percent: grandTotal > 0 ? Math.round((totals[name] / grandTotal) * 100) : 0,
  }));
}
