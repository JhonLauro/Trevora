import React from 'react';
import { formatPeso, kindCounts, pesosFromCentavos, reconciliation } from '../utils/serviceLines';

/**
 * The receipt checked against itself, live.
 *
 * <p>A receipt is its own checksum: the itemised lines have to add up to the
 * printed total. When they do not, one of the two figures was misread — and
 * which one is a question only the person holding the receipt can answer,
 * which is why this reports the gap and never silently corrects either side.
 *
 * <p>It recomputes from the form on every keystroke. The extractor produces
 * the same check as a warning string at extraction time, but that string goes
 * stale the moment a figure is corrected: fix the total and the warning still
 * claims a mismatch. A running figure closes as you fix it, which turns the
 * check into something you can act on rather than something to dismiss.
 */
export default function ReceiptBalance({ services, totalCost }) {
  const balance = reconciliation(services, totalCost);
  const kinds = kindCounts(services);

  if (balance.state === 'no-lines') return null;

  const lineSum = formatPeso(pesosFromCentavos(balance.lineSum));
  const printed = balance.printedTotal === null ? null : formatPeso(pesosFromCentavos(balance.printedTotal));
  const gap = balance.gap === null ? null : formatPeso(Math.abs(pesosFromCentavos(balance.gap)));

  return (
    <section className={`receipt-balance receipt-balance-${balance.state}`}>
      <div className="receipt-balance-figures">
        <div>
          <span>Lines add up to</span>
          <strong>{lineSum}</strong>
        </div>
        <div>
          <span>Receipt total says</span>
          <strong>{printed ?? 'Not filled in'}</strong>
        </div>
        {balance.state === 'gap' && (
          <div className="receipt-balance-delta">
            <span>{balance.gap > 0 ? 'Lines are over by' : 'Lines are short by'}</span>
            <strong>{gap}</strong>
          </div>
        )}
      </div>

      <p className="receipt-balance-message">{messageFor(balance)}</p>

      {kinds.length > 0 && (
        <div className="receipt-balance-kinds">
          {kinds.map((kind) => (
            <span key={kind.value} className={`line-entry-tag line-entry-tag-${kind.value.toLowerCase()}`}>
              {kind.count} {kind.count === 1 ? kind.label.toLowerCase() : `${kind.label.toLowerCase()}`}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function messageFor(balance) {
  if (balance.state === 'match') {
    if (balance.unpricedCount > 0) {
      return `The priced lines match the receipt total. ${balance.unpricedCount} line${
        balance.unpricedCount === 1 ? ' has' : 's have'
      } no amount yet.`;
    }
    return 'The lines add up to the receipt total. Nothing is missing.';
  }
  if (balance.state === 'gap') {
    return 'One of these two figures was misread. Check the lines against the receipt — a wrong'
      + ' digit in a line, a missing line, or a wrong total will all show up here.';
  }
  if (balance.state === 'no-total') {
    return 'Fill in the total cost and this will check it against the lines.';
  }
  if (balance.state === 'no-prices') {
    return 'None of the lines have an amount, so they cannot be checked against the total.'
      + ' Add the amounts from the receipt to make this check work.';
  }
  return '';
}
