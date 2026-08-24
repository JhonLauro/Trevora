// --- Receipt line helpers ---
//
// A service item's `lineEntries` are the receipt printed line by line, each
// tagged with what the line actually is. They are the authoritative breakdown;
// `partsReplaced` and `laborPerformed` are the pre-011 free-text buckets that
// could not tell a fitted part from a tin of thinner.

import { serviceItemsArray } from './serviceText';

/**
 * The four kinds a printed line can be, in the order they appear on a receipt.
 *
 * `label` is what the owner sees — the enum names are internal. The
 * distinction is not cosmetic: only a labour line says which part of the
 * vehicle was worked on, so calling a can of degreaser a part would put a
 * component on the vehicle it never had.
 */
export const LINE_KINDS = [
  {
    value: 'OPERATION',
    label: 'Labour',
    hint: 'Work the shop did. These are what say which part of the vehicle was serviced.',
  },
  {
    value: 'PART',
    label: 'Part',
    hint: 'A component fitted to the vehicle and still on it when it left.',
  },
  {
    value: 'MATERIAL',
    label: 'Supplies',
    hint: 'Used up doing the work — paint, thinner, tape, rags. Not part of the vehicle.',
  },
  {
    value: 'FEE',
    label: 'Fee',
    hint: 'Charged but neither: shop supplies, disposal, towing, diagnostics.',
  },
];

const KIND_LABELS = new Map(LINE_KINDS.map((kind) => [kind.value, kind.label]));

/** Matches the backend default: the kind that claims least when it is unclear. */
export const DEFAULT_LINE_KIND = 'MATERIAL';

export function lineKindLabel(kind) {
  return KIND_LABELS.get(kind) ?? KIND_LABELS.get(DEFAULT_LINE_KIND);
}

export function lineEntriesOf(item) {
  return Array.isArray(item?.lineEntries) ? item.lineEntries.filter(Boolean) : [];
}

export function allLineEntries(services) {
  return serviceItemsArray(services).flatMap(lineEntriesOf);
}

export function hasLineEntries(services) {
  return allLineEntries(services).length > 0;
}

/** How many lines of each kind, for a one-glance summary of a long invoice. */
export function kindCounts(services) {
  const counts = new Map(LINE_KINDS.map((kind) => [kind.value, 0]));
  allLineEntries(services).forEach((entry) => {
    const key = counts.has(entry.kind) ? entry.kind : DEFAULT_LINE_KIND;
    counts.set(key, counts.get(key) + 1);
  });
  return LINE_KINDS
    .map((kind) => ({ ...kind, count: counts.get(kind.value) }))
    .filter((kind) => kind.count > 0);
}

// Money is compared in whole centavos. Summing a column of floats produces
// gaps of a fraction of a centavo, which would render as a mismatch on a
// receipt that adds up perfectly.
function toCentavos(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
}

/** Same slack the extractor allows before reporting a gap: VAT rounding. */
const RECONCILE_TOLERANCE_CENTAVOS = 100;

/**
 * The receipt checked against itself.
 *
 * A receipt is its own checksum: the lines have to add up to the printed
 * total. This used to be computed once during extraction and delivered as a
 * warning string, so it went stale the moment the owner corrected a figure.
 * Here it is derived from whatever is on screen.
 *
 * Deliberately never rewrites either number. The gap says one of the two is
 * wrong, not which.
 */
export function reconciliation(services, totalCost) {
  const entries = allLineEntries(services);
  const priced = entries.map((entry) => toCentavos(entry.lineTotal)).filter((value) => value !== null);
  const printedTotal = toCentavos(totalCost);

  const lineSum = priced.reduce((sum, value) => sum + value, 0);
  const unpricedCount = entries.length - priced.length;

  if (entries.length === 0) {
    return { state: 'no-lines', lineSum: 0, printedTotal, gap: null, pricedCount: 0, unpricedCount: 0 };
  }
  if (printedTotal === null) {
    return { state: 'no-total', lineSum, printedTotal: null, gap: null, pricedCount: priced.length, unpricedCount };
  }
  if (priced.length === 0) {
    return { state: 'no-prices', lineSum: 0, printedTotal, gap: null, pricedCount: 0, unpricedCount };
  }

  const gap = lineSum - printedTotal;
  return {
    state: Math.abs(gap) <= RECONCILE_TOLERANCE_CENTAVOS ? 'match' : 'gap',
    lineSum,
    printedTotal,
    gap,
    pricedCount: priced.length,
    unpricedCount,
  };
}

/** Centavos back to pesos, for display. */
export function pesosFromCentavos(centavos) {
  return (centavos ?? 0) / 100;
}

/**
 * @returns the formatted amount, or null when there is no amount. Null must
 *     not become "PHP 0.00": an unpriced line and a line that genuinely cost
 *     nothing are different facts, and only one of them is on the receipt.
 */
export function formatPeso(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `PHP ${number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Lines ready to send to the API.
 *
 * A blank description is dropped rather than sent: the request rejects it as
 * `@NotBlank`, so an owner who added a row and changed their mind would get a
 * 400 for a row they never filled in. Clearing the description is the way to
 * delete a line.
 */
export function serializeLineEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => String(entry?.description ?? '').trim())
    .map((entry) => ({
      kind: entry.kind || DEFAULT_LINE_KIND,
      description: String(entry.description).trim(),
      partCode: String(entry.partCode ?? '').trim() || null,
      quantity: numberOrNull(entry.quantity),
      unitPrice: numberOrNull(entry.unitPrice),
      lineTotal: numberOrNull(entry.lineTotal),
    }));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
