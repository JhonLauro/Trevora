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

/**
 * Money on the paper, split by what it paid for.
 *
 * The line sum matching the total proves little: on the Palmetto 57 Nissan
 * invoice the labour charge landed on a part line and a part's price on the
 * labour line, and the sum still matched to the centavo. That receipt also
 * prints PARTS AMOUNT and LABOR AMOUNT, and those catch it at once.
 *
 * `printed` is `fieldMetadata.printedSubtotals`, read from the OCR text by the
 * backend (PrintedSubtotals.java). Every figure in it was printed on the
 * receipt; nothing here computes one and passes it off as printed. When the
 * receipt prints TOTAL CHARGES the lines are checked against that, because the
 * record's total is the amount paid, after tax and credits.
 *
 * Warns only. Amounts and kinds are never changed here.
 *
 * What this check cannot see, by construction:
 *  - A part tagged as supplies, or the reverse. Both count toward PARTS, since
 *    receipts print consumables under parts, so the sum does not move.
 *  - Two part amounts swapped with each other, or two labour amounts. The
 *    subtotal does not move either. Only the paper says which cost what.
 * Fee lines count toward neither figure.
 *
 * Verdicts, first match wins: split-mismatch, gap, split-unreadable,
 * no-total / no-prices, verified (the only one that means everything was
 * checked), sum-only. Drafts without `printed` (manual entry, receipts read
 * before this existed) keep the plain total check: match, gap, no-total,
 * no-prices. `attention` is true for the first three receipt verdicts.
 */
export function amountsCheck(services, totalCost, printed) {
  const charges = printed ? toCentavos(printed.charges) : null;
  const againstCharges = charges !== null;
  const base = reconciliation(services, againstCharges ? printed.charges : totalCost);
  const check = {
    ...base,
    againstCharges,
    verdict: base.state,
    attention: false,
    parts: null,
    labour: null,
    totalAlsoOff: false,
    sourcesDisagree: false,
    // Set on a gap when parts and labour could not be checked as well:
    // 'unpriced' or 'unreadable'. The gap message says so rather than letting
    // the weaker verdict stand in for a check that never ran.
    unchecked: null,
    paidNote: null,
  };
  if (!printed || base.state === 'no-lines') return check;

  const paid = toCentavos(totalCost);
  if (againstCharges && paid !== null && paid !== charges) {
    check.paidNote = { paid, charges, explained: adjustmentsExplain(printed, charges, paid) };
  }

  const printedParts = toCentavos(printed.parts);
  const printedLabour = toCentavos(printed.labour);
  const splitRead = printed.split === 'READ' && printedParts !== null && printedLabour !== null;
  if (splitRead) {
    const sums = kindSums(allLineEntries(services));
    check.parts = {
      printed: printedParts,
      lines: sums.parts,
      off: Math.abs(sums.parts - printedParts) > RECONCILE_TOLERANCE_CENTAVOS,
    };
    check.labour = {
      printed: printedLabour,
      lines: sums.labour,
      off: Math.abs(sums.labour - printedLabour) > RECONCILE_TOLERANCE_CENTAVOS,
    };
  }

  // A line with no amount can only leave a kind's lines short of the receipt,
  // never over it. So an over-run is an amount on the wrong line even while
  // other lines are unpriced. A shortfall with unpriced lines could be either,
  // and is reported as unchecked below. It used to skip the split check
  // whenever any line was unpriced, and the live Palmetto draft - parts at
  // 296.53 against 105.72, labour line empty - showed only the charges gap.
  const allPriced = base.pricedCount > 0 && base.unpricedCount === 0;
  const overrun = splitRead && base.pricedCount > 0
    && (check.parts.lines - check.parts.printed > RECONCILE_TOLERANCE_CENTAVOS
      || check.labour.lines - check.labour.printed > RECONCILE_TOLERANCE_CENTAVOS);
  if (splitRead && (overrun || (allPriced && (check.parts.off || check.labour.off)))) {
    return {
      ...check,
      verdict: 'split-mismatch',
      attention: true,
      totalAlsoOff: base.state === 'gap',
      sourcesDisagree: Boolean(printed.sourcesDisagree),
    };
  }
  const splitUnreadable = printed.split === 'UNREADABLE' || (printed.split === 'READ' && !splitRead);
  if (base.state === 'gap') {
    let unchecked = null;
    if (splitUnreadable) unchecked = 'unreadable';
    else if (splitRead && !allPriced) unchecked = 'unpriced';
    return { ...check, verdict: 'gap', attention: true, unchecked };
  }
  if (splitUnreadable) {
    return { ...check, verdict: 'split-unreadable', attention: true };
  }
  if (base.state !== 'match') return check;
  return { ...check, verdict: splitRead && base.unpricedCount === 0 ? 'verified' : 'sum-only' };
}

/**
 * What the status panel says about the amounts: null when there is nothing to
 * say, 'mismatch' when they disagree with the receipt, 'unchecked' when the
 * receipt's split could not be read. The last must not claim a mismatch
 * nobody has seen.
 */
export function railAttention(check) {
  if (!check.attention) return null;
  return check.verdict === 'split-unreadable' ? 'unchecked' : 'mismatch';
}

function kindSums(entries) {
  let parts = 0;
  let labour = 0;
  entries.forEach((entry) => {
    const amount = toCentavos(entry.lineTotal);
    if (amount === null) return;
    if (entry.kind === 'OPERATION') labour += amount;
    // PART and MATERIAL, and an unrecognised kind, which is MATERIAL by default.
    else if (entry.kind !== 'FEE') parts += amount;
  });
  return { parts, labour };
}

/**
 * Whether the tax and credit rows the receipt printed under its charges turn
 * the charges into the amount paid. Only rows that were actually read count; if
 * any of them could not be read, the answer is no rather than a guess.
 */
function adjustmentsExplain(printed, charges, paid) {
  if (!printed.adjustmentsReadable) return false;
  const tax = toCentavos(printed.tax);
  const credits = toCentavos(printed.credits);
  if (tax === null && credits === null) return false;
  return Math.abs(charges + (tax ?? 0) - (credits ?? 0) - paid) <= 1;
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
