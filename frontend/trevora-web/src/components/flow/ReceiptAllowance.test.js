import { describe, expect, it } from 'vitest';
import { noticeFor, refusalFor, uploadBlock, warningFor } from './ReceiptAllowance.jsx';

const allowance = (hourUsed, dayUsed, { hour = 100, day = 350, max = 10, warningLevel = 0 } = {}) => ({
  hour: { limit: hour, used: hourUsed, left: hour - hourUsed },
  day: { limit: day, used: dayUsed, left: day - dayUsed },
  pagesLeft: Math.min(hour - hourUsed, day - dayUsed),
  maxPagesPerUpload: max,
  warningLevel,
});

describe('noticeFor', () => {
  it('says nothing while the chosen pages fit, however close to the limit', () => {
    expect(noticeFor(allowance(0, 0), 9, null)).toBeNull();
    expect(noticeFor(allowance(95, 95), 5, null)).toBeNull();
    expect(noticeFor(allowance(95, 95), 0, null)).toBeNull();
  });

  it('tells the owner to come back when the chosen pages will not fit', () => {
    expect(noticeFor(allowance(95, 95), 9, null)).toEqual({ tone: 'error', kind: 'over' });
  });

  it('counts the day as well as the hour', () => {
    expect(noticeFor(allowance(0, 345), 9, null)).toEqual({ tone: 'error', kind: 'over' });
  });

  it('says the limit is reached once pages are chosen and nothing is left', () => {
    expect(noticeFor(allowance(100, 100), 0, null)).toBeNull();
    expect(noticeFor(allowance(100, 100), 1, null)).toEqual({ tone: 'error', kind: 'reached' });
  });

  it('flags a receipt with more pages than one upload may carry', () => {
    expect(noticeFor(allowance(0, 0), 11, null)).toEqual({ tone: 'warn', kind: 'tooBig' });
  });

  it('calls a refusal with room left a burst', () => {
    expect(noticeFor(allowance(2, 2), 1, 'limit')).toEqual({ tone: 'error', kind: 'burst' });
  });

  it('shows the AI pause whatever the counts say', () => {
    expect(noticeFor(allowance(0, 0), 1, 'budget')).toEqual({ tone: 'error', kind: 'budget' });
  });

  it('still explains a refusal when the allowance could not be loaded', () => {
    expect(noticeFor(null, 3, 'limit')).toEqual({ tone: 'error', kind: 'reachedNoTime' });
    expect(noticeFor(null, 3, null)).toBeNull();
  });
});

describe('warningFor', () => {
  it('shows nothing for an account in good standing', () => {
    expect(warningFor(allowance(0, 0), null)).toBeNull();
    expect(warningFor(null, 'limit')).toBeNull();
  });

  it('shows the warning from the refusal that earned it, or from the last day', () => {
    expect(warningFor(allowance(0, 0), 'warning')).toEqual({ tone: 'warn', kind: 'warning' });
    expect(warningFor(allowance(0, 0, { warningLevel: 1 }), null)).toEqual({ tone: 'warn', kind: 'warning' });
  });

  it('shows the final warning in red, and never downgrades it', () => {
    expect(warningFor(allowance(0, 0), 'finalWarning')).toEqual({ tone: 'error', kind: 'finalWarning' });
    expect(warningFor(allowance(0, 0, { warningLevel: 2 }), 'warning')).toEqual({ tone: 'error', kind: 'finalWarning' });
  });
});

describe('uploadBlock', () => {
  it('lets nine casa pages through with room to spare', () => {
    expect(uploadBlock(allowance(18, 40), 9)).toBeNull();
  });

  it('stops an upload that would be refused, before its pages are stored', () => {
    expect(uploadBlock(allowance(95, 95), 9)).toBe('over');
    expect(uploadBlock(allowance(100, 100), 1)).toBe('usedUp');
  });

  it('blocks nothing before the allowance has loaded or pages are chosen', () => {
    expect(uploadBlock(null, 9)).toBeNull();
    expect(uploadBlock(allowance(100, 100), 0)).toBeNull();
  });
});

describe('refusalFor', () => {
  it('recognises abuse warnings, rate limits and the AI spend pause, and nothing else', () => {
    expect(refusalFor({ status: 429, code: 'ABUSE_WARNING' })).toBe('warning');
    expect(refusalFor({ status: 429, code: 'ABUSE_FINAL_WARNING' })).toBe('finalWarning');
    expect(refusalFor({ status: 429, code: 'RATE_LIMITED' })).toBe('limit');
    expect(refusalFor({ status: 503, message: "Trevora's AI features are paused" })).toBe('budget');
    expect(refusalFor({ status: 503, message: 'Service unavailable' })).toBeNull();
    expect(refusalFor({ status: 400, message: 'Bad receipt' })).toBeNull();
    expect(refusalFor(new Error('network'))).toBeNull();
  });
});
