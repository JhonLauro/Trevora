import React from 'react';
import { formatAmount } from '../../utils/format';
import { coveredFor, isFullyCovered, ownerPaidFor } from '../../utils/spend';

/**
 * What one record cost the owner, in a row or a card.
 *
 * Three cases, and the reason this is a component rather than a `formatAmount`
 * call is that they do not all render as a number:
 *
 * - **Nothing covered** — the common case. Just the amount, exactly as before.
 * - **Partly covered** — the amount paid, with "of 15,000" underneath, so the
 *   invoice is still visible and the row is not quietly smaller than the
 *   receipt it came from.
 * - **Fully covered** — the word "Covered", not "PHP 0". A column of zeroes
 *   reads as missing data, and it buries the one bit of good news in the row.
 *
 * The title attribute carries the full split for the partly- and fully-covered
 * cases, since the visible text is deliberately shorter than the whole story.
 */
export default function RecordCost({ record }) {
  const covered = coveredFor(record);

  if (covered <= 0) {
    return <span className="record-cost">{formatAmount(record?.totalCost)}</span>;
  }

  const invoiced = formatAmount(record?.totalCost);

  if (isFullyCovered(record)) {
    return (
      <span className="record-cost is-covered" title={`Invoiced ${invoiced}, fully covered`}>
        <span className="record-cost__word">Covered</span>
        <small className="record-cost__note">{invoiced} paid for you</small>
      </span>
    );
  }

  return (
    <span className="record-cost" title={`Invoiced ${invoiced}, ${formatAmount(covered)} covered`}>
      {formatAmount(ownerPaidFor(record))}
      <small className="record-cost__note">of {invoiced}</small>
    </span>
  );
}
