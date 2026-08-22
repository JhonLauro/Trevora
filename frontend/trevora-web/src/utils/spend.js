/**
 * What a set of records cost the owner, and what was covered for them.
 *
 * **Two numbers, because one cannot answer both questions.** `totalCost` is
 * what the service cost — the invoice. `amountCovered` is what insurance, an
 * extended warranty or a casa goodwill repair absorbed. Before this split,
 * "Total spent" summed a single column that owners had been filling in with
 * whichever of the two they had to hand, so the counter added invoice totals
 * to out-of-pocket amounts as though they were the same quantity.
 *
 * Out-of-pocket is always derived here and never stored. A third column would
 * be free to contradict the two it comes from the moment either was edited.
 *
 * A record with no coverage is the overwhelmingly common case, so everything
 * here has to read correctly when `amountCovered` is 0, absent, or arrives as
 * a string from JSON.
 */

function amount(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

/** What the owner paid for one record: the invoice less whatever was covered. */
export function ownerPaidFor(record) {
  const total = amount(record?.totalCost);
  const covered = coveredFor(record);
  const paid = total - covered;
  // Never negative. The database constrains coverage to at most the total and
  // the API clamps it, but a bad row must not be able to subtract from a
  // running total and quietly understate what a vehicle has cost.
  return paid > 0 ? paid : 0;
}

/** What was covered for one record, clamped to the invoice. */
export function coveredFor(record) {
  const total = amount(record?.totalCost);
  const covered = amount(record?.amountCovered);
  if (covered <= 0) return 0;
  return covered > total ? total : covered;
}

/** True when the whole invoice was covered and the owner paid nothing. */
export function isFullyCovered(record) {
  const total = amount(record?.totalCost);
  // A zero-cost record is not "fully covered", it is free. Saying "Covered"
  // there would claim an insurer paid a bill that never existed.
  return total > 0 && coveredFor(record) >= total;
}

/**
 * Totals across a set of records.
 *
 * `hasCoverage` is what the UI keys off: with nothing covered anywhere, the
 * covered line is not rendered at all rather than rendered as zero. A
 * permanent "PHP 0 covered" under every spend figure is noise for the many
 * owners who have never claimed anything.
 */
export function spendTotals(records) {
  const list = Array.isArray(records) ? records : [];
  const totals = list.reduce(
    (acc, record) => {
      acc.invoiced += amount(record?.totalCost);
      acc.covered += coveredFor(record);
      acc.ownerPaid += ownerPaidFor(record);
      return acc;
    },
    { invoiced: 0, covered: 0, ownerPaid: 0 },
  );

  return { ...totals, hasCoverage: totals.covered > 0 };
}
