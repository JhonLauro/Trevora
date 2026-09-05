/**
 * Service categories, as the backend decided them.
 *
 * This file used to invent its own vocabulary — Maintenance / Repairs /
 * Tires & brakes / Not categorised — and re-derive it from regexes over the
 * record's text on every render. It was one of four disagreeing definitions of
 * `service_category`, and it was the one the owner actually saw, so fixing the
 * classifier changed nothing on the dashboard. The regexes are gone. The value
 * comes from `item.serviceCategory` and nowhere else.
 *
 * `Tires & brakes` did not survive and is not recreated here. It answered
 * "which part of the car" — a component question that the parts map already
 * answers from OPERATION lines — while pretending to answer "what kind of
 * work". Ten of its fourteen records are Repair and four are Maintenance.
 *
 * Two attribution rules live here and they are deliberately different. Read
 * `spendCategory` before changing either.
 */
import { serviceItemsArray } from './serviceText';

/**
 * What the backend writes when nothing could decide.
 * `ServiceClassificationService.UNCATEGORIZED`. The single definition on this
 * side of the wire — `recordStatus.js` imports it from here.
 */
export const UNCATEGORIZED = 'UNCATEGORIZED';

/** Where the sub-3% tail goes. Deliberately not "Other": that is a real
    category a person can choose, and two things in a chart called Other with
    different meanings is unreadable. */
export const SMALLER_CATEGORIES = 'Smaller categories';

/** Below this share of total spend a category joins the tail. */
const TAIL_THRESHOLD_PERCENT = 3;

/** Shouting case is for storage, not for people. */
export function categoryLabel(category) {
  if (category === UNCATEGORIZED) return 'Not categorised';
  return category;
}

/**
 * The one category a record's whole cost is attributed to, for spend.
 *
 * <b>Why a single category and not a split.</b> The chart has to sum to the
 * money actually spent, and `total_cost` is a per-visit fact that is
 * deliberately not the sum of its line items (007:11 — "total_cost is
 * intentionally NOT summed from line items; line_cost is optional/
 * informational only"). Splitting a visit's cost across its items in
 * proportion to `line_cost` would therefore invent numbers on every record
 * where line costs are missing or do not add up to the total, which is most of
 * them. One record, one bucket, the whole amount.
 *
 * <b>Why the most expensive item wins.</b> A visit that replaced a clutch and
 * topped up the washer fluid is a repair, and the money says so more reliably
 * than the order the lines were printed in. When no item has a `lineCost` — a
 * receipt that only printed a total — there is nothing to compare, so the
 * first item as printed wins, which is the closest thing to what the shop
 * considered the job.
 *
 * This is not the rule used for filtering. See `recordCategories`: a record
 * that contains both a repair and a service genuinely belongs under both
 * filters, and only spend needs a single answer.
 */
export function spendCategory(record) {
  const items = serviceItemsArray(record?.services);
  if (!items.length) return UNCATEGORIZED;

  const best = items.reduce((winner, item) => {
    const cost = Number(item?.lineCost);
    const winnerCost = Number(winner?.lineCost);
    const hasCost = Number.isFinite(cost);
    const winnerHasCost = Number.isFinite(winnerCost);

    if (hasCost && !winnerHasCost) return item;
    if (!hasCost && winnerHasCost) return winner;
    if (hasCost && winnerHasCost && cost !== winnerCost) return cost > winnerCost ? item : winner;
    // Equal costs, or none anywhere: printed order decides.
    return Number(item?.sortOrder ?? 0) < Number(winner?.sortOrder ?? 0) ? item : winner;
  });

  return categoryOf(best);
}

/**
 * Every distinct category a record carries, for filtering.
 *
 * A visit with an oil change and a brake repair is both, and showing it under
 * each filter is correct rather than a double count — a filter answers "show me
 * records involving X", which this record does twice over.
 */
export function recordCategories(record) {
  const items = serviceItemsArray(record?.services);
  if (!items.length) return [UNCATEGORIZED];
  return [...new Set(items.map(categoryOf))];
}

/** True when the record carries the given category on any of its items. */
export function recordHasCategory(record, category) {
  return recordCategories(record).includes(category);
}

function categoryOf(item) {
  const value = String(item?.serviceCategory || '').trim();
  return value || UNCATEGORIZED;
}

/** The service names inside a bucket, for naming what is in it. */
function serviceNames(record) {
  return serviceItemsArray(record?.services)
    .map((item) => String(item?.serviceType || '').trim())
    .filter(Boolean);
}

/**
 * Spend per category, largest first, with the tail folded up.
 *
 * Categories under 3% of spend are grouped into one row rather than drawn as a
 * queue of one-pixel bars. `UNCATEGORIZED` is never grouped and is always
 * present, at any size including none: it is not a kind of spending, it is the
 * count of records the pipeline could not classify, and a chart that hides it
 * when it is small hides exactly the state worth noticing early. Zero is the
 * healthy reading and is worth showing as one.
 */
export function spendByCategory(records) {
  const totals = new Map();
  const counts = new Map();
  const names = new Map();

  (records || []).forEach((record) => {
    const category = spendCategory(record);
    totals.set(category, (totals.get(category) || 0) + Number(record.totalCost || 0));
    counts.set(category, (counts.get(category) || 0) + 1);
    if (!names.has(category)) names.set(category, new Set());
    serviceNames(record).forEach((name) => names.get(category).add(name));
  });

  if (!totals.has(UNCATEGORIZED)) {
    totals.set(UNCATEGORIZED, 0);
    counts.set(UNCATEGORIZED, 0);
    names.set(UNCATEGORIZED, new Set());
  }

  const grandTotal = [...totals.values()].reduce((sum, value) => sum + value, 0);
  const share = (value) => (grandTotal > 0 ? (value / grandTotal) * 100 : 0);

  const kept = [];
  const tail = { total: 0, count: 0, names: new Set() };

  [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, total]) => {
      const isTail = category !== UNCATEGORIZED && share(total) < TAIL_THRESHOLD_PERCENT && total > 0;
      if (isTail) {
        tail.total += total;
        tail.count += counts.get(category) || 0;
        names.get(category).forEach((name) => tail.names.add(name));
        return;
      }
      kept.push({
        name: category,
        label: categoryLabel(category),
        total,
        count: counts.get(category) || 0,
        examples: [...names.get(category)].slice(0, 3),
        percent: Math.round(share(total)),
      });
    });

  if (tail.total > 0) {
    kept.push({
      name: SMALLER_CATEGORIES,
      label: SMALLER_CATEGORIES,
      total: tail.total,
      count: tail.count,
      examples: [...tail.names].slice(0, 3),
      percent: Math.round(share(tail.total)),
    });
  }

  return kept;
}
