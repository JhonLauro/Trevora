import { describe, expect, it } from 'vitest';
import { amountsCheck, railAttention } from './serviceLines';

const line = (kind, description, lineTotal) => ({ kind, description, lineTotal });
const services = (...lineEntries) => [{ serviceType: 'CVT fluid service', lineEntries }];

/** What the Palmetto 57 Nissan receipt prints about itself. */
const PALMETTO = {
  split: 'READ',
  parts: '105.72',
  labour: '134.27',
  source: 'TOTALS_BOX',
  sourcesDisagree: false,
  charges: '239.99',
  tax: '16.80',
  credits: '56.79',
  adjustmentsReadable: true,
};

const correctLines = () => services(
  line('OPERATION', 'PERFORM CVT TRANSMISSION FLUID SERVICE', 134.27),
  line('PART', 'CVT ENHANCER', 27.99),
  line('PART', 'SYN/CVT 5QT', 77.73),
);

describe('amountsCheck', () => {
  it('flags the live Palmetto extraction, whose sum matched the charges', () => {
    const check = amountsCheck(services(
      line('OPERATION', 'PERFORM CVT TRANSMISSION FLUID SERVICE', 77.73),
      line('PART', 'CVT ENHANCER', 27.99),
      line('PART', 'SYN/CVT 5QT', 134.27),
    ), 200, PALMETTO);

    expect(check.verdict).toBe('split-mismatch');
    expect(check.attention).toBe(true);
    expect(check.totalAlsoOff).toBe(false);
    expect(check.parts).toMatchObject({ printed: 10572, lines: 16226, off: true });
    expect(check.labour).toMatchObject({ printed: 13427, lines: 7773, off: true });
  });

  it('verifies correct lines against the charges, not the amount paid', () => {
    const check = amountsCheck(correctLines(), 200, PALMETTO);

    expect(check.verdict).toBe('verified');
    expect(check.attention).toBe(false);
    expect(check.againstCharges).toBe(true);
    expect(check.printedTotal).toBe(23999);
  });

  it('explains the paid figure only when the read tax and credit rows account for it', () => {
    expect(amountsCheck(correctLines(), 200, PALMETTO).paidNote)
      .toEqual({ paid: 20000, charges: 23999, explained: true });
    expect(amountsCheck(correctLines(), 210, PALMETTO).paidNote.explained).toBe(false);
    expect(amountsCheck(correctLines(), 200, { ...PALMETTO, adjustmentsReadable: false }).paidNote.explained)
      .toBe(false);
    expect(amountsCheck(correctLines(), 239.99, PALMETTO).paidNote).toBeNull();
  });

  // The two blind spots documented in PrintedSubtotals.java, pinned so nobody
  // mistakes a pass here for proof that every amount is on the right line.
  it('cannot see a part tagged as supplies', () => {
    const check = amountsCheck(services(
      line('OPERATION', 'PERFORM CVT TRANSMISSION FLUID SERVICE', 134.27),
      line('MATERIAL', 'CVT ENHANCER', 27.99),
      line('PART', 'SYN/CVT 5QT', 77.73),
    ), 200, PALMETTO);
    expect(check.verdict).toBe('verified');
  });

  it('cannot see two part amounts swapped with each other', () => {
    const check = amountsCheck(services(
      line('OPERATION', 'PERFORM CVT TRANSMISSION FLUID SERVICE', 134.27),
      line('PART', 'CVT ENHANCER', 77.73),
      line('PART', 'SYN/CVT 5QT', 27.99),
    ), 200, PALMETTO);
    expect(check.verdict).toBe('verified');
  });

  it('leaves fees out of both figures, so a fee shows as a charges gap only', () => {
    const lines = correctLines();
    lines[0].lineEntries.push(line('FEE', 'SHOP SUPPLIES', 10));
    const check = amountsCheck(lines, 200, PALMETTO);

    expect(check.verdict).toBe('gap');
    expect(check.attention).toBe(true);
    expect(check.parts.off).toBe(false);
  });

  it('does not call missing amounts a wrong-line problem', () => {
    const check = amountsCheck(services(
      line('OPERATION', 'PERFORM CVT TRANSMISSION FLUID SERVICE', 134.27),
      line('PART', 'CVT ENHANCER', null),
      line('PART', 'SYN/CVT 5QT', 77.73),
    ), 200, PALMETTO);
    expect(check.verdict).toBe('gap');
  });

  it('says so when the split is printed but unreadable', () => {
    const check = amountsCheck(correctLines(), 200, {
      split: 'UNREADABLE', charges: '239.99', sourcesDisagree: false, adjustmentsReadable: false,
    });
    expect(check.verdict).toBe('split-unreadable');
    expect(check.attention).toBe(true);
  });

  it('reports only the total when no split is printed', () => {
    const printed = { split: 'NOT_PRINTED', sourcesDisagree: false, adjustmentsReadable: false };
    const check = amountsCheck(correctLines(), 239.99, printed);

    expect(check.verdict).toBe('sum-only');
    expect(check.againstCharges).toBe(false);
    expect(check.attention).toBe(false);
  });

  it('is sum-only, never verified, while a line has no amount', () => {
    const lines = correctLines();
    lines[0].lineEntries.push(line('PART', 'DRAIN PLUG WASHER', null));
    const check = amountsCheck(lines, 200, PALMETTO);

    expect(check.verdict).toBe('sum-only');
    expect(check.unpricedCount).toBe(1);
  });

  it('keeps the old behaviour for drafts with no printed figures', () => {
    const check = amountsCheck(correctLines(), 239.99, undefined);
    expect(check.verdict).toBe('match');
    expect(check.attention).toBe(false);
    expect(amountsCheck(correctLines(), 200, undefined).verdict).toBe('gap');
    expect(amountsCheck(correctLines(), 200, undefined).attention).toBe(false);
  });
});

describe('railAttention', () => {
  it('never tells the status panel an unreadable split is a mismatch', () => {
    const unreadable = { split: 'UNREADABLE', charges: '239.99', sourcesDisagree: false, adjustmentsReadable: false };
    expect(railAttention(amountsCheck(correctLines(), 200, unreadable))).toBe('unchecked');
    const swapped = services(
      line('OPERATION', 'PERFORM CVT TRANSMISSION FLUID SERVICE', 77.73),
      line('PART', 'CVT ENHANCER', 27.99),
      line('PART', 'SYN/CVT 5QT', 134.27),
    );
    expect(railAttention(amountsCheck(swapped, 200, PALMETTO))).toBe('mismatch');
    expect(railAttention(amountsCheck(correctLines(), 200, PALMETTO))).toBeNull();
    expect(railAttention(amountsCheck(correctLines(), 150, undefined))).toBeNull();
  });
});
