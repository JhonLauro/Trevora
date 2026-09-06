import { describe, expect, it } from 'vitest';
import {
  hasWarrantyTerms,
  isWarrantyUnset,
  warrantyDistanceLine,
  warrantyEndedReasons,
  warrantyGapLines,
  warrantyLimitLine,
  warrantyTitleKey,
  warrantyTone,
} from './warranty';

/**
 * How a warranty reads, given what the backend worked out.
 *
 * <p>No arithmetic is tested here — there is none in the module. What is worth
 * asserting is that a partial answer never renders as a whole one: that the
 * card does not say "whichever comes first" about a race with one runner, and
 * that a state which could only check half the terms says which half.
 */
describe('warranty presentation', () => {
  const active = {
    status: 'ACTIVE',
    expiringSoon: false,
    startDate: '2025-03-14',
    months: 36,
    kmLimit: 100000,
    expiryDate: '2028-03-14',
    daysRemaining: 554,
    currentKm: 42300,
    kmRemaining: 57700,
  };

  it('reads an unset warranty as unset', () => {
    expect(isWarrantyUnset({ status: 'NOT_SET' })).toBe(true);
    expect(isWarrantyUnset(null)).toBe(true);
    expect(isWarrantyUnset(active)).toBe(false);
    expect(hasWarrantyTerms({ status: 'NOT_SET' })).toBe(false);
  });

  it('states both limits and that the first one wins', () => {
    expect(warrantyLimitLine(active)).toEqual({
      key: 'warranty.limits.both',
      vars: { date: 'Mar 14, 2028', km: '100,000' },
    });
    expect(warrantyDistanceLine(active)).toEqual({
      key: 'warranty.distance.remaining',
      vars: { current: '42,300', remaining: '57,700' },
    });
    expect(warrantyTitleKey(active)).toBe('warranty.covered');
    expect(warrantyTone(active)).toBe('ok');
    expect(warrantyGapLines(active)).toEqual([]);
  });

  /* "whichever comes first" about a single limit would imply the other one had
     been checked, which is the exact claim these states exist to avoid. */
  it('does not claim a race between two limits when only one is known', () => {
    const mileageOnly = {
      ...active, status: 'MILEAGE_ONLY', startDate: null, months: null, expiryDate: null, daysRemaining: null,
    };

    expect(warrantyLimitLine(mileageOnly)).toEqual({
      key: 'warranty.limits.kmOnly',
      vars: { km: '100,000' },
    });
  });

  it('names the limit it could not check on a mileage-only warranty', () => {
    const mileageOnly = {
      ...active, status: 'MILEAGE_ONLY', startDate: null, months: null, expiryDate: null, daysRemaining: null,
    };

    expect(warrantyGapLines(mileageOnly).map((gap) => gap.key)).toEqual(['warranty.gap.noStartDate']);
  });

  it('distinguishes a missing purchase date from a missing coverage period', () => {
    const noPeriod = { ...active, status: 'MILEAGE_ONLY', months: null, expiryDate: null, daysRemaining: null };

    expect(warrantyGapLines(noPeriod).map((gap) => gap.key)).toEqual(['warranty.gap.noMonths']);
  });

  it('names every gap rather than the first, so the owner fills in all of it', () => {
    const barely = {
      status: 'INCOMPLETE',
      expiringSoon: false,
      startDate: '2025-03-14',
      months: null,
      kmLimit: null,
      expiryDate: null,
      daysRemaining: null,
      currentKm: null,
      kmRemaining: null,
    };

    expect(warrantyGapLines(barely).map((gap) => gap.key))
      .toEqual(['warranty.gap.noMonths', 'warranty.gap.noKmLimit']);
    expect(warrantyTitleKey(barely)).toBe('warranty.incomplete');
    expect(warrantyTone(barely)).toBe('unknown');
  });

  /* Still covered, and saying only that would be useless to somebody choosing
     where to book their next service. */
  it('leads with the warning when cover is running out, in any covered state', () => {
    expect(warrantyTitleKey({ ...active, expiringSoon: true })).toBe('warranty.endingSoon');
    expect(warrantyTone({ ...active, expiringSoon: true })).toBe('warn');
    expect(warrantyTitleKey({ ...active, status: 'MILEAGE_ONLY', expiringSoon: true }))
      .toBe('warranty.endingSoon');
    expect(warrantyTitleKey({ ...active, status: 'TIME_ONLY', expiringSoon: true }))
      .toBe('warranty.endingSoon');
  });

  it('says how far past the limit an expired warranty is', () => {
    const over = {
      ...active, status: 'EXPIRED', currentKm: 104000, kmRemaining: -4000, daysRemaining: 554,
    };

    expect(warrantyDistanceLine(over)).toEqual({
      key: 'warranty.distance.over',
      vars: { current: '104,000', over: '4,000', limit: '100,000' },
    });
    expect(warrantyEndedReasons(over).map((reason) => reason.key))
      .toEqual(['warranty.ended.byDistance']);
    expect(warrantyTone(over)).toBe('ended');
  });

  /* Both limits can be past. Reporting only the date would let an owner
     conclude their other vehicles are fine on mileage. */
  it('names both reasons when both limits have been passed', () => {
    const over = {
      ...active,
      status: 'EXPIRED',
      expiryDate: '2023-03-14',
      daysRemaining: -1000,
      currentKm: 104000,
      kmRemaining: -4000,
    };

    expect(warrantyEndedReasons(over).map((reason) => reason.key))
      .toEqual(['warranty.ended.byDate', 'warranty.ended.byDistance']);
  });

  it('shows a distance with no limit to measure it against as a bare reading', () => {
    const timeOnly = {
      ...active, status: 'TIME_ONLY', kmLimit: null, kmRemaining: null,
    };

    expect(warrantyDistanceLine(timeOnly)).toEqual({
      key: 'warranty.distance.recorded',
      vars: { current: '42,300' },
    });
    expect(warrantyGapLines(timeOnly).map((gap) => gap.key)).toEqual(['warranty.gap.noKmLimit']);
  });

  it('omits the distance line entirely when no reading exists', () => {
    expect(warrantyDistanceLine({ ...active, currentKm: null, kmRemaining: null })).toBeNull();
    expect(warrantyGapLines({ ...active, currentKm: null, kmRemaining: null }).map((gap) => gap.key))
      .toEqual(['warranty.gap.noOdometer']);
  });
});
